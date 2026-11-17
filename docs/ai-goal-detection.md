# AI-assisted goal detection from YouTube

SportAnalist uses **Firebase AI Logic with the Gemini Developer API** to analyse the YouTube URL already saved on the active match. This route accepts YouTube videos that are **public or unlisted**; private videos are not supported. One YouTube URL is sent per analysis request.

The browser SDK sends the URL directly to Firebase AI Logic / Gemini. SportAnalist and Vercel do not download, transcode or proxy the video. The video is analysed with both visual frames and its audio track.

## Model and workflow

- Model: `gemini-3.5-flash-lite`, which supports video input through Firebase AI Logic.
- The app asks for likely goals, timestamp in seconds, scoring side, player name/number when visible, zone, confidence and a short evidence explanation.
- The analysed side is mapped to `moment = attack`; the opponent is mapped to `moment = defense`.
- AI candidates are not persisted automatically. An `admin` or `analyst` must choose the scoring team when uncertain and click **Confirm and register goal**. The normal event insertion path then stores the event against the correct team.
- The initial kit descriptions default to Yellow for the analysed team and Blue for the opponent, based on the calibration video. Editors can change these values for each analysis.

Video models can approximate timestamps and may miss a very brief ball crossing. Sound recognition for non-speech sounds (for example crowd reactions) may also be wrong. The analyst must confirm every candidate.

## Firebase setup

Use a Firebase project owned by the club / organisation:

1. In Firebase Console, create or select a project and register a **Web app**. Keep the web app configuration available.
2. Open **AI Services → AI Logic → Get started**. Select **Gemini Developer API** (not the Agent Platform / Vertex AI provider) and complete the guided setup. This enables Firebase AI Logic and Gemini Developer API for the project.
3. Create a score-based **reCAPTCHA Enterprise** key in Google Cloud Console under the same `sport-analist` project. Choose a Web key, leave the checkbox challenge disabled, and add `sport-analist.vercel.app` as an allowed domain. Keep the public site key. Do not put a reCAPTCHA secret in the application.
4. In Firebase Console, open **Security → App Check → Apps**, register `SportAnalist Web` with the **reCAPTCHA Enterprise** provider, and use the same public site key. The guided Firebase AI Logic setup enforces App Check for Firebase AI Logic. The application initialises the `ReCaptchaEnterpriseProvider` and sends App Check tokens with its requests.
5. Add these values to Vercel → Project → Settings → Environment Variables (Production, and Preview if used):
   - `NEXT_PUBLIC_FIREBASE_API_KEY`: the Firebase Web app `apiKey`.
   - `NEXT_PUBLIC_FIREBASE_APP_ID`: the Firebase Web app `appId`.
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: the Firebase project ID.
   - `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`: the reCAPTCHA v3 **site** key (not the secret).
6. Redeploy the Vercel application after adding or changing environment variables.

For local testing, use a separate development reCAPTCHA Enterprise key for `localhost` or implement the Firebase App Check debug provider. Do not add `localhost` to the production reCAPTCHA key.

The Firebase web configuration and reCAPTCHA site key are public client configuration. Do not add a Gemini standalone API key, service-account key, Firebase Admin credential, or reCAPTCHA secret to `NEXT_PUBLIC_*` variables or frontend code. The Firebase AI Logic setup workflow configures the Gemini Developer API access for the Firebase project.

## Free-tier and data handling

Firebase AI Logic itself can be used without a Firebase billing account with the Gemini Developer API free tier. The free tier has model-specific quotas and rate limits; those limits can change. The current Gemini Developer API pricing page lists free input and output for `gemini-3.5-flash-lite`, but also states that free-tier content may be used by Google to improve its products. The editor UI therefore requires explicit consent before sending a match video for analysis. Do not use the free tier for videos that must not be used for product improvement; choose a paid tier after reviewing Google's terms if that confidentiality requirement applies.

## Relevant environment variables

See [`.env.example`](../.env.example). AI analysis remains disabled in the app until the Firebase Web app settings and App Check site key are present.
