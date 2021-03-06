/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import {DebugProtocol} from 'vscode-debugprotocol';
import {ChromeConnection} from 'vscode-chrome-debug-core';

import * as mockery from 'mockery';
import {EventEmitter} from 'events';
import * as assert from 'assert';
import {Mock, MockBehavior, It} from 'typemoq';

import * as testUtils from './testUtils';

/** Not mocked - use for type only */
import {ChromeDebugAdapter as _ChromeDebugAdapter} from '../src/chromeDebugAdapter';

class MockChromeDebugSession {
    public sendEvent(event: DebugProtocol.Event): void {
    }

    public sendRequest(command: string, args: any, timeout: number, cb: (response: DebugProtocol.Response) => void): void {
    }
}

const MODULE_UNDER_TEST = '../src/chromeDebugAdapter';
suite('ChromeDebugAdapter', () => {
    let mockChromeConnection: Mock<ChromeConnection>;
    let mockEventEmitter: EventEmitter;

    let chromeDebugAdapter: _ChromeDebugAdapter;

    setup(() => {
        testUtils.setupUnhandledRejectionListener();
        mockery.enable({ useCleanCache: true, warnOnReplace: false, warnOnUnregistered: false });

        // Create a ChromeConnection mock with .on and .attach. Tests can fire events via mockEventEmitter
        mockEventEmitter = new EventEmitter();
        mockChromeConnection = Mock.ofType(ChromeConnection, MockBehavior.Strict);
        mockChromeConnection
            .setup(x => x.on(It.isAnyString(), It.isAny()))
            .callback((eventName: string, handler: (msg: any) => void) => mockEventEmitter.on(eventName, handler));
        mockChromeConnection
            .setup(x => x.attach(It.isValue(undefined), It.isAnyNumber(), It.isValue(undefined)))
            .returns(() => Promise.resolve());
        mockChromeConnection
            .setup(x => x.isAttached)
            .returns(() => false);

        // Instantiate the ChromeDebugAdapter, injecting the mock ChromeConnection
        const cDAClass: typeof _ChromeDebugAdapter = require(MODULE_UNDER_TEST).ChromeDebugAdapter;
        chromeDebugAdapter = new cDAClass({ chromeConnection: function() { return mockChromeConnection.object; } } as any, new MockChromeDebugSession() as any);
    });

    teardown(() => {
        testUtils.removeUnhandledRejectionListener();
        mockery.deregisterAll();
        mockery.disable();
        mockChromeConnection.verifyAll();
    });

    suite('launch()', () => {
        test('launches with minimal correct args', () => {
            let spawnCalled = false;
            function spawn(chromePath: string, args: string[]): any {
                // Just assert that the chrome path is some string with 'chrome' in the path, and there are >0 args
                assert(chromePath.toLowerCase().indexOf('chrome') >= 0);
                assert(args.indexOf('--remote-debugging-port=9222') >= 0);
                assert(args.indexOf('file:///c:/path%20with%20space/index.html') >= 0);
                assert(args.indexOf('abc') >= 0);
                assert(args.indexOf('def') >= 0);
                spawnCalled = true;

                return { on: () => { }, unref: () => { } };
            }

            // Mock spawn for chrome process, and 'fs' for finding chrome.exe.
            // These are mocked as empty above - note that it's too late for mockery here.
            require('child_process').spawn = spawn;
            require('fs').statSync = () => true;

            mockChromeConnection
                .setup(x => x.attach(It.isValue(undefined), It.isAnyNumber(), It.isAnyString()))
                .returns(() => Promise.resolve())
                .verifiable();

            return chromeDebugAdapter.launch({ file: 'c:\\path with space\\index.html', runtimeArgs: ['abc', 'def'] })
                .then(() => assert(spawnCalled));
        });
    });
});