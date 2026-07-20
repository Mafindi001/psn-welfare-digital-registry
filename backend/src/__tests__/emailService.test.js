'use strict';

// Prevent the EmailService constructor from opening a real SMTP connection
jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        verify: jest.fn().mockResolvedValue(true),
        sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
    })),
}));

// Prevent template file-system reads from failing in CI
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        promises: {
            ...actual.promises,
            access: jest.fn().mockRejectedValue(new Error('no dir')),
            readdir: jest.fn().mockResolvedValue([]),
        },
    };
});

// Re-require after mocks are in place
let emailService;
beforeAll(async () => {
    emailService = require('../config/email');
    // Give the async initialize() a moment to settle
    await new Promise(r => setTimeout(r, 50));
});

beforeEach(() => {
    jest.clearAllMocks();
});

// ─── htmlToText ───────────────────────────────────────────────────────────────

describe('htmlToText', () => {
    it('strips HTML tags', () => {
        const text = emailService.htmlToText('<h1>Hello</h1><p>World</p>');
        expect(text).not.toContain('<');
        expect(text).toContain('Hello');
        expect(text).toContain('World');
    });

    it('replaces &amp; with &', () => {
        expect(emailService.htmlToText('A &amp; B')).toContain('A & B');
    });

    it('replaces &lt; and &gt;', () => {
        const text = emailService.htmlToText('&lt;tag&gt;');
        expect(text).toContain('<tag>');
    });

    it('replaces &quot; with double quote', () => {
        expect(emailService.htmlToText('say &quot;hi&quot;')).toContain('say "hi"');
    });

    it('collapses multiple whitespace into single spaces', () => {
        const text = emailService.htmlToText('<p>hello    world</p>');
        expect(text).toMatch(/hello\s+world/);
        expect(text).not.toMatch(/\s{3,}/);
    });
});

// ─── sendEmail ────────────────────────────────────────────────────────────────

describe('sendEmail', () => {
    it('returns success:false with a descriptive error when template does not exist', async () => {
        const result = await emailService.sendEmail(
            'to@example.com',
            'Test Subject',
            'nonexistent_template',
            {}
        );

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Template "nonexistent_template" not found/);
    });

    it('returns success:true and messageId when template exists and transporter succeeds', async () => {
        // Register a minimal test template
        const handlebars = require('handlebars');
        emailService.templates['test_tpl'] = handlebars.compile('<p>Hello {{name}}</p>');

        // Give the emailService a working transporter
        emailService.transporter = {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'abc-123' }),
        };

        const result = await emailService.sendEmail(
            'to@example.com',
            'Test Subject',
            'test_tpl',
            { name: 'Alice' }
        );

        expect(result.success).toBe(true);
        expect(result.messageId).toBe('abc-123');
        expect(result.to).toBe('to@example.com');
    });

    it('renders template variables into the HTML body', async () => {
        const handlebars = require('handlebars');
        emailService.templates['var_tpl'] = handlebars.compile('<p>{{greeting}}</p>');

        let capturedOptions;
        emailService.transporter = {
            sendMail: jest.fn().mockImplementation(opts => {
                capturedOptions = opts;
                return Promise.resolve({ messageId: 'xyz' });
            }),
        };

        await emailService.sendEmail('to@example.com', 'Subj', 'var_tpl', { greeting: 'Howdy' });

        expect(capturedOptions.html).toContain('Howdy');
    });

    it('does not throw when transporter.sendMail rejects — returns success:false', async () => {
        const handlebars = require('handlebars');
        emailService.templates['err_tpl'] = handlebars.compile('<p>hi</p>');
        emailService.transporter = {
            sendMail: jest.fn().mockRejectedValue(new Error('SMTP failed')),
        };

        const result = await emailService.sendEmail('to@example.com', 'Subj', 'err_tpl', {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('SMTP failed');
    });
});

// ─── sendBulkEmails ───────────────────────────────────────────────────────────

describe('sendBulkEmails', () => {
    beforeEach(() => {
        const handlebars = require('handlebars');
        emailService.templates['bulk_tpl'] = handlebars.compile('<p>Hi {{name}}</p>');
    });

    it('returns correct total / sent / failed counts', async () => {
        emailService.transporter = {
            sendMail: jest.fn()
                .mockResolvedValueOnce({ messageId: 'ok-1' })
                .mockRejectedValueOnce(new Error('failed'))
                .mockResolvedValueOnce({ messageId: 'ok-3' }),
        };

        const recipients = [
            { email: 'a@test.com', variables: { name: 'A' } },
            { email: 'b@test.com', variables: { name: 'B' } },
            { email: 'c@test.com', variables: { name: 'C' } },
        ];

        const result = await emailService.sendBulkEmails(recipients, 'Subj', 'bulk_tpl', {});

        expect(result.total).toBe(3);
        expect(result.sent).toBe(2);
        expect(result.failed).toBe(1);
    });

    it('merges per-recipient variables with shared data', async () => {
        const captured = [];
        emailService.transporter = {
            sendMail: jest.fn().mockImplementation(opts => {
                captured.push(opts.html);
                return Promise.resolve({ messageId: 'ok' });
            }),
        };

        const handlebars = require('handlebars');
        emailService.templates['merge_tpl'] = handlebars.compile('{{shared}} {{name}}');

        const recipients = [
            { email: 'x@test.com', variables: { name: 'X' } },
        ];

        await emailService.sendBulkEmails(recipients, 'S', 'merge_tpl', { shared: 'Hello' });

        expect(captured[0]).toContain('Hello');
        expect(captured[0]).toContain('X');
    });

    it('returns an empty results array for zero recipients', async () => {
        const result = await emailService.sendBulkEmails([], 'S', 'bulk_tpl', {});
        expect(result.total).toBe(0);
        expect(result.sent).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.results).toHaveLength(0);
    });
});

// ─── sendWelcomeEmail ─────────────────────────────────────────────────────────

describe('sendWelcomeEmail', () => {
    beforeEach(() => {
        emailService.createDefaultTemplates();
        emailService.transporter = {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'welcome-msg' }),
        };
    });

    it('calls sendEmail with the welcome template and member data', async () => {
        const member = {
            email: 'alice@example.com',
            fullName: 'Alice',
            psnNumber: 'PSN-001',
        };

        const result = await emailService.sendWelcomeEmail(member);

        expect(result.success).toBe(true);
        expect(emailService.transporter.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'alice@example.com' })
        );
    });

    it('includes a temporary password in the email when provided', async () => {
        const member = { email: 'bob@example.com', fullName: 'Bob', psnNumber: 'P2' };
        let capturedOptions;
        emailService.transporter.sendMail = jest.fn().mockImplementation(opts => {
            capturedOptions = opts;
            return Promise.resolve({ messageId: 'x' });
        });

        await emailService.sendWelcomeEmail(member, 'TempPass@123');

        expect(capturedOptions.html).toContain('TempPass@123');
    });
});

// ─── sendReminderEmail ────────────────────────────────────────────────────────

describe('sendReminderEmail', () => {
    beforeEach(() => {
        emailService.createDefaultTemplates();
        emailService.transporter = {
            sendMail: jest.fn().mockResolvedValue({ messageId: 'reminder-msg' }),
        };
    });

    it('calls sendEmail with the reminder template and event data', async () => {
        const reminderData = {
            recipientEmail: 'carol@example.com',
            memberName: 'Carol',
            eventType: 'Birthday',
            eventTitle: "Carol's Birthday",
            eventDate: new Date('2025-06-15').toISOString(),
            daysUntil: 5,
        };

        const result = await emailService.sendReminderEmail(reminderData);

        expect(result.success).toBe(true);
        expect(emailService.transporter.sendMail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'carol@example.com' })
        );
    });

    it('formats the event date as a locale string', async () => {
        let capturedOptions;
        emailService.transporter.sendMail = jest.fn().mockImplementation(opts => {
            capturedOptions = opts;
            return Promise.resolve({ messageId: 'x' });
        });

        await emailService.sendReminderEmail({
            recipientEmail: 'x@example.com',
            memberName: 'X',
            eventType: 'Anniversary',
            eventTitle: 'Wedding Anniversary',
            eventDate: new Date('2025-01-01').toISOString(),
            daysUntil: 7,
        });

        // The date should be a human-readable string, not an ISO timestamp
        expect(capturedOptions.html).not.toContain('2025-01-01T');
    });
});

// ─── Default templates ────────────────────────────────────────────────────────

describe('createDefaultTemplates', () => {
    it('creates a "welcome" template that renders name and email', () => {
        emailService.createDefaultTemplates();

        const html = emailService.templates.welcome({
            name: 'John Doe',
            email: 'john@example.com',
            psnNumber: 'PSN-001',
            temporaryPassword: 'Temp@123',
            loginUrl: 'https://app.example.com/login',
        });

        expect(html).toContain('John Doe');
        expect(html).toContain('john@example.com');
        expect(html).toContain('PSN-001');
        expect(html).toContain('Temp@123');
    });

    it('creates a "reminder" template that renders event details', () => {
        emailService.createDefaultTemplates();

        const html = emailService.templates.reminder({
            memberName: 'Jane Smith',
            eventType: 'Birthday',
            eventTitle: "Jane's Birthday",
            eventDate: 'January 1, 2025',
            daysUntil: 3,
        });

        expect(html).toContain('Jane Smith');
        expect(html).toContain('Birthday');
        expect(html).toContain('3');
    });
});
