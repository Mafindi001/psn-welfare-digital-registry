'use strict';

jest.mock('../config/database', () => require('./__mocks__/prisma'));
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));
jest.mock('jsonwebtoken', () => ({
    verify: jest.fn(),
}));

const WebSocket = require('ws');
const { webSocketService } = require('../services/websocketService');

// A minimal mock WebSocket client
function makeMockWs(readyState = WebSocket.OPEN) {
    return {
        readyState,
        send: jest.fn(),
        close: jest.fn(),
        on: jest.fn(),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    webSocketService.clients.clear();
    webSocketService.rooms.clear();
});

// ─── joinRoom ─────────────────────────────────────────────────────────────────

describe('joinRoom', () => {
    it('creates the room if it does not exist', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);

        webSocketService.joinRoom('user-1', 'room:test');

        expect(webSocketService.rooms.has('room:test')).toBe(true);
    });

    it('adds the userId to the room', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);

        webSocketService.joinRoom('user-1', 'room:test');

        expect(webSocketService.rooms.get('room:test').has('user-1')).toBe(true);
    });

    it('sends a ROOM_JOINED notification to the user', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);

        webSocketService.joinRoom('user-1', 'room:test');

        expect(ws.send).toHaveBeenCalledWith(
            expect.stringContaining('"type":"ROOM_JOINED"')
        );
        expect(ws.send).toHaveBeenCalledWith(
            expect.stringContaining('"room":"room:test"')
        );
    });

    it('allows multiple users in the same room', () => {
        webSocketService.clients.set('user-1', makeMockWs());
        webSocketService.clients.set('user-2', makeMockWs());

        webSocketService.joinRoom('user-1', 'shared-room');
        webSocketService.joinRoom('user-2', 'shared-room');

        expect(webSocketService.rooms.get('shared-room').size).toBe(2);
    });
});

// ─── leaveRoom ────────────────────────────────────────────────────────────────

describe('leaveRoom', () => {
    it('removes the userId from the room', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);
        webSocketService.joinRoom('user-1', 'room:test');

        webSocketService.leaveRoom('user-1', 'room:test');

        expect(webSocketService.rooms.get('room:test')).toBeUndefined();
    });

    it('deletes the room when the last user leaves', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);
        webSocketService.joinRoom('user-1', 'room:test');

        webSocketService.leaveRoom('user-1', 'room:test');

        expect(webSocketService.rooms.has('room:test')).toBe(false);
    });

    it('keeps the room when other users remain', () => {
        webSocketService.clients.set('user-1', makeMockWs());
        webSocketService.clients.set('user-2', makeMockWs());
        webSocketService.joinRoom('user-1', 'room:test');
        webSocketService.joinRoom('user-2', 'room:test');

        webSocketService.leaveRoom('user-1', 'room:test');

        expect(webSocketService.rooms.has('room:test')).toBe(true);
        expect(webSocketService.rooms.get('room:test').has('user-2')).toBe(true);
    });

    it('sends a ROOM_LEFT notification', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);
        webSocketService.joinRoom('user-1', 'room:test');
        ws.send.mockClear();

        webSocketService.leaveRoom('user-1', 'room:test');

        expect(ws.send).toHaveBeenCalledWith(
            expect.stringContaining('"type":"ROOM_LEFT"')
        );
    });

    it('does nothing when the room does not exist', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);

        expect(() => webSocketService.leaveRoom('user-1', 'nonexistent-room')).not.toThrow();
    });
});

// ─── handleDisconnection ──────────────────────────────────────────────────────

describe('handleDisconnection', () => {
    it('removes the client from the clients map', () => {
        webSocketService.clients.set('user-1', makeMockWs());

        webSocketService.handleDisconnection('user-1');

        expect(webSocketService.clients.has('user-1')).toBe(false);
    });

    it('removes the user from all rooms', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);
        webSocketService.joinRoom('user-1', 'room:a');
        webSocketService.joinRoom('user-1', 'room:b');

        webSocketService.handleDisconnection('user-1');

        expect(webSocketService.rooms.has('room:a')).toBe(false);
        expect(webSocketService.rooms.has('room:b')).toBe(false);
    });

    it('leaves rooms with remaining members intact', () => {
        webSocketService.clients.set('user-1', makeMockWs());
        webSocketService.clients.set('user-2', makeMockWs());
        webSocketService.joinRoom('user-1', 'shared');
        webSocketService.joinRoom('user-2', 'shared');

        webSocketService.handleDisconnection('user-1');

        expect(webSocketService.rooms.has('shared')).toBe(true);
        expect(webSocketService.rooms.get('shared').has('user-2')).toBe(true);
    });
});

// ─── sendToUser ───────────────────────────────────────────────────────────────

describe('sendToUser', () => {
    it('sends a JSON-serialised message when socket is OPEN', () => {
        const ws = makeMockWs(WebSocket.OPEN);
        webSocketService.clients.set('user-1', ws);

        webSocketService.sendToUser('user-1', { type: 'TEST', payload: 42 });

        expect(ws.send).toHaveBeenCalledWith('{"type":"TEST","payload":42}');
    });

    it('does not send when socket is in CONNECTING state', () => {
        const ws = makeMockWs(WebSocket.CONNECTING); // 0
        webSocketService.clients.set('user-1', ws);

        webSocketService.sendToUser('user-1', { type: 'TEST' });

        expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not throw when userId has no client entry', () => {
        expect(() => webSocketService.sendToUser('unknown-user', { type: 'TEST' })).not.toThrow();
    });
});

// ─── broadcastToRoom ──────────────────────────────────────────────────────────

describe('broadcastToRoom', () => {
    it('sends the message to every client in the room', () => {
        const ws1 = makeMockWs();
        const ws2 = makeMockWs();
        webSocketService.clients.set('u1', ws1);
        webSocketService.clients.set('u2', ws2);
        webSocketService.joinRoom('u1', 'test-room');
        webSocketService.joinRoom('u2', 'test-room');
        ws1.send.mockClear();
        ws2.send.mockClear();

        webSocketService.broadcastToRoom('test-room', { type: 'ALERT', msg: 'hello' });

        expect(ws1.send).toHaveBeenCalled();
        expect(ws2.send).toHaveBeenCalled();
    });

    it('includes the roomId in every broadcast payload', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('u1', ws);
        webSocketService.joinRoom('u1', 'my-room');
        ws.send.mockClear();

        webSocketService.broadcastToRoom('my-room', { type: 'DATA' });

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.room).toBe('my-room');
    });

    it('does nothing when room does not exist', () => {
        expect(() =>
            webSocketService.broadcastToRoom('nonexistent', { type: 'DATA' })
        ).not.toThrow();
    });
});

// ─── handleMessage ────────────────────────────────────────────────────────────

describe('handleMessage', () => {
    let ws;

    beforeEach(() => {
        ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);
    });

    it('responds to PING with a PONG containing a timestamp', () => {
        webSocketService.handleMessage('user-1', JSON.stringify({ type: 'PING' }));

        expect(ws.send).toHaveBeenCalledWith(
            expect.stringContaining('"type":"PONG"')
        );
    });

    it('calls joinRoom for SUBSCRIBE message with a room', () => {
        const spy = jest.spyOn(webSocketService, 'joinRoom');

        webSocketService.handleMessage(
            'user-1',
            JSON.stringify({ type: 'SUBSCRIBE', room: 'admin:dashboard' })
        );

        expect(spy).toHaveBeenCalledWith('user-1', 'admin:dashboard');
        spy.mockRestore();
    });

    it('calls leaveRoom for UNSUBSCRIBE message with a room', () => {
        const spy = jest.spyOn(webSocketService, 'leaveRoom');
        webSocketService.joinRoom('user-1', 'some-room');

        webSocketService.handleMessage(
            'user-1',
            JSON.stringify({ type: 'UNSUBSCRIBE', room: 'some-room' })
        );

        expect(spy).toHaveBeenCalledWith('user-1', 'some-room');
        spy.mockRestore();
    });

    it('calls broadcastToRoom for BROADCAST message with room and data', () => {
        const spy = jest.spyOn(webSocketService, 'broadcastToRoom');

        webSocketService.handleMessage(
            'user-1',
            JSON.stringify({ type: 'BROADCAST', room: 'admin:audit', data: { foo: 'bar' } })
        );

        expect(spy).toHaveBeenCalledWith('admin:audit', { foo: 'bar' });
        spy.mockRestore();
    });

    it('ignores SUBSCRIBE without a room field', () => {
        const spy = jest.spyOn(webSocketService, 'joinRoom');

        webSocketService.handleMessage('user-1', JSON.stringify({ type: 'SUBSCRIBE' }));

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it('does not throw on unknown message type', () => {
        expect(() =>
            webSocketService.handleMessage('user-1', JSON.stringify({ type: 'UNKNOWN_OP' }))
        ).not.toThrow();
    });

    it('does not throw on invalid JSON', () => {
        expect(() =>
            webSocketService.handleMessage('user-1', 'not-json{{{')
        ).not.toThrow();
    });
});

// ─── Public broadcast methods ─────────────────────────────────────────────────

describe('broadcastUserLogin', () => {
    it('broadcasts a USER_LOGIN event to the admin:dashboard room', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('admin-1', ws);
        webSocketService.joinRoom('admin-1', 'admin:dashboard');
        ws.send.mockClear();

        webSocketService.broadcastUserLogin({ id: 'u1', fullName: 'Alice', psnNumber: 'P1' });

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.type).toBe('USER_LOGIN');
        expect(sent.user.fullName).toBe('Alice');
    });
});

describe('broadcastUserLogout', () => {
    it('broadcasts a USER_LOGOUT event with the userId', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('admin-1', ws);
        webSocketService.joinRoom('admin-1', 'admin:dashboard');
        ws.send.mockClear();

        webSocketService.broadcastUserLogout('user-99');

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.type).toBe('USER_LOGOUT');
        expect(sent.userId).toBe('user-99');
    });
});

describe('broadcastAuditLog', () => {
    it('broadcasts a structured AUDIT_LOG event', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('admin-1', ws);
        webSocketService.joinRoom('admin-1', 'admin:audit');
        ws.send.mockClear();

        webSocketService.broadcastAuditLog({
            id: 'log-1',
            action: 'LOGIN',
            userName: 'Bob',
            timestamp: '2024-01-01T00:00:00Z',
            details: {},
        });

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.type).toBe('AUDIT_LOG');
        expect(sent.log.action).toBe('LOGIN');
    });
});

describe('broadcastReminderSent', () => {
    it('broadcasts to admin:notifications room', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('admin-1', ws);
        webSocketService.joinRoom('admin-1', 'admin:notifications');
        ws.send.mockClear();

        webSocketService.broadcastReminderSent({
            id: 'rem-1',
            recipientEmail: 'x@test.com',
            eventType: 'Birthday',
            status: 'sent',
        });

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.type).toBe('REMINDER_SENT');
    });

    it('also sends a personal notification when memberId is provided', () => {
        const memberWs = makeMockWs();
        webSocketService.clients.set('member-1', memberWs);

        webSocketService.broadcastReminderSent({
            recipientEmail: 'x@test.com',
            eventType: 'Birthday',
            status: 'sent',
            memberId: 'member-1',
        });

        expect(memberWs.send).toHaveBeenCalled();
    });
});

describe('broadcastSystemAlert', () => {
    it('broadcasts a SYSTEM_ALERT to system:broadcast room', () => {
        const ws = makeMockWs();
        webSocketService.clients.set('user-1', ws);
        webSocketService.joinRoom('user-1', 'system:broadcast');
        ws.send.mockClear();

        webSocketService.broadcastSystemAlert({ level: 'warning', message: 'Maintenance soon' });

        const sent = JSON.parse(ws.send.mock.calls[0][0]);
        expect(sent.type).toBe('SYSTEM_ALERT');
        expect(sent.alert.level).toBe('warning');
        expect(sent.alert.message).toBe('Maintenance soon');
    });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('getStats', () => {
    it('returns zero counts when no clients or rooms exist', () => {
        const stats = webSocketService.getStats();
        expect(stats.totalClients).toBe(0);
        expect(stats.totalRooms).toBe(0);
        expect(stats.rooms).toEqual([]);
    });

    it('returns correct client and room counts', () => {
        webSocketService.clients.set('u1', makeMockWs());
        webSocketService.clients.set('u2', makeMockWs());
        webSocketService.joinRoom('u1', 'room:a');
        webSocketService.joinRoom('u2', 'room:a');
        webSocketService.joinRoom('u1', 'room:b');

        const stats = webSocketService.getStats();

        expect(stats.totalClients).toBe(2);
        expect(stats.totalRooms).toBe(2);
        const roomA = stats.rooms.find(r => r.roomId === 'room:a');
        expect(roomA.clientCount).toBe(2);
    });
});
