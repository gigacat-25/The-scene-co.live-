import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClerkClient } from '@clerk/backend';

type Bindings = {
  DB: D1Database;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_SECRET_KEY: string;
  GMAIL_CLIENT_ID: string;
  GMAIL_CLIENT_SECRET: string;
  GMAIL_REFRESH_TOKEN: string;
  ADMIN_EMAIL: string;
  MEDIA_BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// -------------------------------------------------------------
// GMAIL OAUTH EMAIL HELPERS
// -------------------------------------------------------------

function base64urlEncode(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getGmailAccessToken(env: Bindings): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || 'Failed to exchange Gmail refresh token');
  }
  return data.access_token;
}

async function sendGmailEmail(env: Bindings, to: string, subject: string, htmlBody: string): Promise<void> {
  const accessToken = await getGmailAccessToken(env);
  
  const mimeMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    htmlBody
  ].join('\r\n');

  const encodedMessage = base64urlEncode(mimeMessage);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedMessage
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gmail API messages/send failed: ${errorText}`);
  }
}

// Enable CORS for frontend local development and production
app.use(
  '*',
  cors({
    origin: '*', // In production, replace with specific domain if desired
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
  })
);

// -------------------------------------------------------------
// PUBLIC ENDPOINTS
// -------------------------------------------------------------

// 1. Get Projects
app.get('/api/projects', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM projects ORDER BY sort_order ASC, id ASC'
    ).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Get Services
app.get('/api/services', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM services ORDER BY sort_order ASC, id ASC'
    ).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Post Inquiry (Contact Form Submission)
app.post('/api/inquiries', async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, project_type, budget, timeline, details } = body;

    if (!name || !email || !project_type || !budget || !timeline || !details) {
      return c.json({ error: 'Missing required inquiry fields' }, 400);
    }

    const info = await c.env.DB.prepare(
      `INSERT INTO inquiries (name, email, project_type, budget, timeline, details, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'unread')`
    )
      .bind(name, email, project_type, budget, timeline, details)
      .run();

    // Dispatch emails asynchronously in the background so we do not delay the API response
    c.executionCtx.waitUntil((async () => {
      try {
        // 1. Send client confirmation email
        const clientSubject = `We have received your brief — THE SCENE CO. LIVE`;
        const clientHtml = `
          <div style="font-family: sans-serif; max-width: 600px; color: #111; line-height: 1.6;">
            <h2 style="color: #d946ef; font-size: 24px; text-transform: uppercase;">Let's build something unforgettable.</h2>
            <p>Hi ${name},</p>
            <p>Thank you for initiating contact with THE SCENE CO. LIVE. We have received your creative brief and our production team is reviewing your project parameters.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <h3 style="color: #666; font-size: 14px; text-transform: uppercase; margin-bottom: 10px;">Your Brief Summary</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 8px;"><strong>Project Scale/Type:</strong> ${project_type}</li>
              <li style="margin-bottom: 8px;"><strong>Estimated Budget:</strong> ${budget}</li>
              <li style="margin-bottom: 8px;"><strong>Timeline Expectation:</strong> ${timeline}</li>
            </ul>
            <div style="background: #f9f9f9; border: 1px solid #f1f1f1; padding: 15px; border-radius: 8px; margin-top: 15px;">
              <strong>Brief Vision Summary:</strong>
              <p style="white-space: pre-wrap; margin: 8px 0 0 0; font-size: 14px; color: #555;">${details}</p>
            </div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p>One of our creative directors will get back to you within 24 hours to schedule an initial consultation.</p>
            <br />
            <p>Regards,</p>
            <p><strong>THE SCENE CO. LIVE</strong><br />Production Studio</p>
          </div>
        `;
        await sendGmailEmail(c.env, email, clientSubject, clientHtml);

        // 2. Send admin notification email
        if (c.env.ADMIN_EMAIL) {
          const adminSubject = `[ALERT] New Client Brief from ${name} (${project_type})`;
          const adminHtml = `
            <div style="font-family: sans-serif; max-width: 600px; color: #111; line-height: 1.6;">
              <h2 style="color: #a3e635; font-size: 20px; text-transform: uppercase;">New Project Brief Received</h2>
              <p>An inquiry has been submitted through the contact page form. The details are compiled below:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-weight: bold; width: 150px;">Client Name:</td>
                  <td style="padding: 10px;">${name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-weight: bold;">Client Email:</td>
                  <td style="padding: 10px;"><a href="mailto:${email}">${email}</a></td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-weight: bold;">Project Type:</td>
                  <td style="padding: 10px;">${project_type}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-weight: bold;">Estimated Budget:</td>
                  <td style="padding: 10px; color: #b45309;">${budget}</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-weight: bold;">Timeline:</td>
                  <td style="padding: 10px; color: #2563eb;">${timeline}</td>
                </tr>
              </table>
              <div style="background: #f9f9f9; border: 1px solid #f1f1f1; padding: 20px; border-radius: 8px; margin-top: 15px;">
                <strong>Creative Brief & Details:</strong>
                <p style="white-space: pre-wrap; margin: 10px 0 0 0; font-size: 14px; color: #333;">${details}</p>
              </div>
              <p style="margin-top: 30px; font-size: 12px; color: #888;">This lead has been saved to your Cloudflare D1 Database and is available for management in your CMS Admin Dashboard.</p>
            </div>
          `;
          await sendGmailEmail(c.env, c.env.ADMIN_EMAIL, adminSubject, adminHtml);
        }
      } catch (err: any) {
        console.error("Background email dispatch failed:", err);
      }
    })());

    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// -------------------------------------------------------------
// PROTECTED ADMIN ENDPOINTS (Requires Clerk Authorization Header)
// -------------------------------------------------------------

// Apply Clerk authentication to all admin endpoints
app.use('/api/admin/*', async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized: Missing or invalid authorization header' }, 401);
    }

    const clerk = createClerkClient({
      publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
      secretKey: c.env.CLERK_SECRET_KEY,
    });

    const requestState = await clerk.authenticateRequest(c.req.raw);
    if (!requestState.isSignedIn) {
      return c.json({ error: 'Unauthorized: Invalid session signature or expired token' }, 401);
    }

    await next();
  } catch (err: any) {
    return c.json({ error: `Unauthorized: ${err.message}` }, 401);
  }
});

// 1. Get Inquiries
app.get('/api/admin/inquiries', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM inquiries ORDER BY created_at DESC'
    ).all();
    return c.json(results);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 2. Update Inquiry Status (e.g. read / unread)
app.patch('/api/admin/inquiries/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    if (!status || (status !== 'read' && status !== 'unread')) {
      return c.json({ error: 'Invalid or missing status parameter' }, 400);
    }

    await c.env.DB.prepare('UPDATE inquiries SET status = ? WHERE id = ?')
      .bind(status, id)
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 3. Delete Inquiry
app.delete('/api/admin/inquiries/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM inquiries WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 4. Create Project
app.post('/api/admin/projects', async (c) => {
  try {
    const body = await c.req.json();
    const { title, description, category, location, image_url, col_span, card_class, sort_order } = body;

    if (!title || !description || !category || !location || !image_url) {
      return c.json({ error: 'Missing required project fields' }, 400);
    }

    const info = await c.env.DB.prepare(
      `INSERT INTO projects (title, description, category, location, image_url, col_span, card_class, sort_order) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        title,
        description,
        category,
        location,
        image_url,
        col_span || 3,
        card_class || 'card-magenta',
        sort_order || 0
      )
      .run();

    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 5. Update Project
app.put('/api/admin/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { title, description, category, location, image_url, col_span, card_class, sort_order } = body;

    if (!title || !description || !category || !location || !image_url) {
      return c.json({ error: 'Missing required project fields' }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE projects SET title = ?, description = ?, category = ?, location = ?, 
       image_url = ?, col_span = ?, card_class = ?, sort_order = ? WHERE id = ?`
    )
      .bind(
        title,
        description,
        category,
        location,
        image_url,
        col_span || 3,
        card_class || 'card-magenta',
        sort_order || 0,
        id
      )
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 6. Delete Project
app.delete('/api/admin/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 7. Create Service
app.post('/api/admin/services', async (c) => {
  try {
    const body = await c.req.json();
    const { title, description, icon, card_class, sort_order } = body;

    if (!title || !description || !icon) {
      return c.json({ error: 'Missing required service fields' }, 400);
    }

    const info = await c.env.DB.prepare(
      `INSERT INTO services (title, description, icon, card_class, sort_order) 
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(title, description, icon, card_class || 'card-lime', sort_order || 0)
      .run();

    return c.json({ success: true, id: info.meta.last_row_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 8. Update Service
app.put('/api/admin/services/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { title, description, icon, card_class, sort_order } = body;

    if (!title || !description || !icon) {
      return c.json({ error: 'Missing required service fields' }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE services SET title = ?, description = ?, icon = ?, card_class = ?, sort_order = ? WHERE id = ?`
    )
      .bind(title, description, icon, card_class || 'card-lime', sort_order || 0, id)
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 9. Delete Service
app.delete('/api/admin/services/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM services WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 10. Get Settings (Public)
app.get('/api/settings', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all();
    const settingsObj = results.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    return c.json(settingsObj);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 11. Update Settings (Protected Admin)
app.put('/api/admin/settings', async (c) => {
  try {
    const body = await c.req.json();
    const statements = Object.entries(body).map(([key, value]) => {
      return c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .bind(key, String(value));
    });
    await c.env.DB.batch(statements);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 12. Upload Media (Protected Admin)
app.post('/api/admin/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded or invalid file type' }, 400);
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return c.json({ error: 'File size exceeds the 5MB limit' }, 400);
    }

    // Validate mime type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: 'Unsupported file type. Only JPEG, PNG, WEBP, SVG, and GIF are allowed.' }, 400);
    }

    // Create unique key
    const uniqueId = crypto.randomUUID();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `images/${uniqueId}-${sanitizedName}`;

    // Upload to R2
    await c.env.MEDIA_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    return c.json({ success: true, url: `/api/media/${key}` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 13. Serve Media (Public)
app.get('/api/media/*', async (c) => {
  try {
    const url = new URL(c.req.url);
    const key = decodeURIComponent(url.pathname.substring('/api/media/'.length));

    if (!key) {
      return c.json({ error: 'Key is required' }, 400);
    }

    const object = await c.env.MEDIA_BUCKET.get(key);
    if (!object) {
      return c.json({ error: 'Object not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return c.body(object.body, 200, Object.fromEntries(headers.entries()));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default app;
