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
    const { name, email, phone, project_type, budget, timeline, details } = body;

    if (!name || !email || !project_type || !budget || !timeline || !details) {
      return c.json({ error: 'Missing required inquiry fields' }, 400);
    }

    const info = await c.env.DB.prepare(
      `INSERT INTO inquiries (name, email, phone, project_type, budget, timeline, details, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unread')`
    )
      .bind(name, email, phone || null, project_type, budget, timeline, details)
      .run();

    // Dispatch emails asynchronously in the background so we do not delay the API response
    c.executionCtx.waitUntil((async () => {
      try {
        // 1. Send client confirmation email
        const clientSubject = `We have received your brief | THE SCENE CO. LIVE`;
        const clientHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>We have received your brief | THE SCENE CO. LIVE</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
              body {
                margin: 0;
                padding: 0;
                background-color: #080808;
                font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
              }
            </style>
          </head>
          <body>
            <div style="background-color: #080808; padding: 40px 20px; min-height: 100%;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #121212; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                
                <!-- Glow Accent Bar -->
                <div style="height: 4px; background: linear-gradient(90deg, #d946ef 0%, #a3e635 100%);"></div>
                
                <!-- Logo Header -->
                <div style="padding: 30px 40px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); text-align: left;">
                  <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; color: #a3e635;">THE SCENE CO. LIVE</span>
                </div>
                
                <!-- Content Area -->
                <div style="padding: 40px;">
                  <h2 style="font-size: 26px; font-weight: 800; color: #ffffff; text-transform: uppercase; margin: 0 0 20px 0; letter-spacing: -0.5px; line-height: 1.25;">
                    Let's build<br/><span style="color: #d946ef;">something unforgettable</span>.
                  </h2>
                  
                  <p style="font-size: 15px; color: #e5e7eb; line-height: 1.6; margin: 0 0 24px 0;">Hi ${name},</p>
                  <p style="font-size: 15px; color: #9ca3af; line-height: 1.6; margin: 0 0 30px 0;">
                    Thank you for initiating contact with THE SCENE CO. LIVE. We have received your creative parameters, and our production studio has compiled your brief below:
                  </p>
                  
                  <!-- Bento parameters grid table -->
                  <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; overflow: hidden; background-color: rgba(255, 255, 255, 0.01);">
                    <tr>
                      <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); width: 150px; vertical-align: middle;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Phone Number</span>
                      </td>
                      <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #ffffff; font-weight: 600; vertical-align: middle;">
                        ${phone || 'Not provided'}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); width: 150px; vertical-align: middle;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Project Scale</span>
                      </td>
                      <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #ffffff; font-weight: 600; vertical-align: middle;">
                        ${project_type}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Est. Budget</span>
                      </td>
                      <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #a3e635; font-weight: 700; vertical-align: middle;">
                        ${budget}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px; background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Timeline</span>
                      </td>
                      <td style="padding: 16px; font-size: 15px; color: #3b82f6; font-weight: 600; vertical-align: middle;">
                        ${timeline}
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Description box -->
                  <div style="margin-top: 30px; background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 24px;">
                    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; display: block; font-weight: 700; margin-bottom: 12px;">Creative Vision Summary</span>
                    <p style="white-space: pre-wrap; margin: 0; font-size: 14px; color: #e5e7eb; line-height: 1.7; font-family: inherit;">${details}</p>
                  </div>
                  
                  <p style="font-size: 15px; color: #9ca3af; line-height: 1.6; margin: 30px 0 0 0;">
                    One of our creative directors will get back to you within 24 hours to schedule an initial production consultation. We look forward to collaborating.
                  </p>
                </div>
                
                <!-- Footer -->
                <div style="padding: 30px 40px; background-color: #0b0b0b; border-top: 1px solid rgba(255, 255, 255, 0.04); text-align: center;">
                  <p style="font-size: 12px; color: #6b7280; margin: 0; line-height: 1.6;">
                    THE SCENE CO. LIVE &copy; 2026. All rights reserved.<br/>
                    Spatial event architects, engineers, and production leads translating radical creative concepts into high-fidelity physical reality.
                  </p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;
        await sendGmailEmail(c.env, email, clientSubject, clientHtml);

        // 2. Send admin notification email
        if (c.env.ADMIN_EMAIL) {
          const adminSubject = `[ALERT] New Client Brief from ${name} | ${project_type}`;
          const adminHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Project Brief Received</title>
              <style>
                @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
                body {
                  margin: 0;
                  padding: 0;
                  background-color: #080808;
                  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                  -webkit-font-smoothing: antialiased;
                }
              </style>
            </head>
            <body>
              <div style="background-color: #080808; padding: 40px 20px; min-height: 100%;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #121212; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                  
                  <!-- Alert Accent Bar (Lime Glow) -->
                  <div style="height: 4px; background: linear-gradient(90deg, #a3e635 0%, #eab308 100%);"></div>
                  
                  <!-- Admin Alert Header -->
                  <div style="padding: 30px 40px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); text-align: left; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #a3e635;">[ALERT] NEW BRIEF RECEIVED</span>
                  </div>
                  
                  <!-- Content Area -->
                  <div style="padding: 40px;">
                    <h2 style="font-size: 22px; font-weight: 800; color: #ffffff; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: -0.5px; line-height: 1.25;">
                      New Lead Parameters
                    </h2>
                    <p style="font-size: 14px; color: #9ca3af; line-height: 1.6; margin: 0 0 24px 0;">
                      An inquiry has been submitted through the contact page form. The lead details are compiled below:
                    </p>
                    
                    <!-- Bento parameters grid table -->
                    <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; overflow: hidden; background-color: rgba(255, 255, 255, 0.01);">
                      <tr>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); width: 150px; vertical-align: middle;">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Client Name</span>
                        </td>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #ffffff; font-weight: 600; vertical-align: middle;">
                          ${name}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Client Email</span>
                        </td>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; vertical-align: middle;">
                          <a href="mailto:${email}" style="color: #d946ef; text-decoration: underline; font-weight: 600;">${email}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Client Phone</span>
                        </td>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #ffffff; font-weight: 600; vertical-align: middle;">
                          ${phone ? `<a href="tel:${phone}" style="color: #a3e635; text-decoration: underline; font-weight: 600;">${phone}</a>` : 'Not provided'}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Project Scale</span>
                        </td>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #ffffff; font-weight: 600; vertical-align: middle;">
                          ${project_type}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Est. Budget</span>
                        </td>
                        <td style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 15px; color: #a3e635; font-weight: 700; vertical-align: middle;">
                          ${budget}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px; background-color: rgba(255, 255, 255, 0.01); vertical-align: middle;">
                          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; font-weight: 700;">Timeline</span>
                        </td>
                        <td style="padding: 16px; font-size: 15px; color: #3b82f6; font-weight: 600; vertical-align: middle;">
                          ${timeline}
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Description box -->
                    <div style="margin-top: 30px; background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 24px;">
                      <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888888; display: block; font-weight: 700; margin-bottom: 12px;">Client Creative Brief</span>
                      <p style="white-space: pre-wrap; margin: 0; font-size: 14px; color: #e5e7eb; line-height: 1.7; font-family: inherit;">${details}</p>
                    </div>
                  </div>
                  
                  <!-- Footer -->
                  <div style="padding: 30px 40px; background-color: #0b0b0b; border-top: 1px solid rgba(255, 255, 255, 0.04); text-align: center;">
                    <p style="font-size: 11px; color: #6b7280; margin: 0; line-height: 1.6;">
                      This lead has been saved to your Cloudflare D1 Database and is available for management in your CMS Admin Dashboard.
                    </p>
                  </div>
                </div>
              </div>
            </body>
            </html>
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
    console.log("[DEBUG AUTH] Auth Header:", authHeader ? authHeader.substring(0, 30) + "..." : "missing");

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized: Missing or invalid authorization header' }, 401);
    }

    const clerk = createClerkClient({
      publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
      secretKey: c.env.CLERK_SECRET_KEY,
    });

    const requestState = await clerk.authenticateRequest(c.req.raw);
    console.log("[DEBUG AUTH] RequestState isSignedIn:", requestState.isSignedIn);
    console.log("[DEBUG AUTH] RequestState status:", requestState.status);
    console.log("[DEBUG AUTH] RequestState reason:", requestState.reason);
    console.log("[DEBUG AUTH] RequestState message:", requestState.message);

    if (!requestState.isSignedIn) {
      return c.json({ 
        error: 'Unauthorized: Invalid session signature or expired token',
        reason: requestState.reason,
        message: requestState.message
      }, 401);
    }

    await next();
  } catch (err: any) {
    console.error("[DEBUG AUTH] Exception during authentication:", err);
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
// Force Wrangler reload to pick up new Google OAuth secrets

