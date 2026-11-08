# Turn on "Continue with Google" (about 10 minutes)

You do the two setups below. When you're done, tell me and I'll flip the button
on in the app (one small change + deploy). Until then it politely says
"use your email".

You'll need two browser tabs: **Google Cloud Console** and your **Supabase**
dashboard.

---

## Part A — Google Cloud (create the sign-in credential)

1. Go to **https://console.cloud.google.com** and sign in with your Google account.
2. Top-left, create a project (name it **DisMyth**) if you don't have one. Select it.
3. In the search bar type **"OAuth consent screen"** and open it.
   - User type: **External** → Create.
   - App name: **DisMyth**. User support email: your email.
   - **App domain** → Privacy policy URL: `https://dismyth.app/privacy.html`
   - Terms of service URL: `https://dismyth.app/terms.html`
   - Authorized domain: `dismyth.app`
   - Developer contact email: your email → Save and continue through the steps.
   - (You can leave it in "Testing" to start; when you're ready for everyone,
     click **Publish app** on this screen.)
4. In the search bar type **"Credentials"** → open it → **+ Create Credentials**
   → **OAuth client ID**.
   - Application type: **Web application**. Name: **DisMyth Web**.
   - Under **Authorized redirect URIs** click **Add URI** and paste exactly:
     `https://lrauoqykwgwhxxhpffzf.supabase.co/auth/v1/callback`
   - Create. A box pops up with a **Client ID** and **Client secret** — keep it open.

## Part B — Supabase (enable Google)

1. Go to **https://supabase.com/dashboard** → your DisMyth project.
2. Left menu: **Authentication** → **Providers** (or "Sign In / Providers").
3. Find **Google** → toggle it **ON**.
4. Paste the **Client ID** and **Client secret** from Part A.
5. **Save**.

## Part C — tell me

Message me "**Google is set up**". I'll switch the app's "Continue with Google"
button to the real sign-in and redeploy. Then you (and anyone) can sign up with
one tap.

---

### Notes
- **Facebook** is deliberately left for later — it requires Facebook's app
  review, a longer process. Email + Google cover almost everyone.
- Nothing here costs money. Google sign-in is free.
