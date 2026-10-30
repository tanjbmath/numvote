# Numvote

Minimal anonymous classroom response tool using Firebase Authentication, Cloud Firestore and Cloud Functions.

## Setup

Use a dedicated Firebase project for Numvote. Do not reuse S.T.E.P.'s credentials unless you deliberately want both apps to share one backend.

1. Create a Firebase project and register a Web App.
2. Enable Authentication → Sign-in method → Anonymous.
3. Create a Cloud Firestore database.
4. Upgrade to Blaze; deploying Cloud Functions requires billing.
5. Copy the Web App configuration into firebase-config.js, replacing all REPLACE_WITH values.
6. Install the Firebase CLI (npm install -g firebase-tools) and authenticate (firebase login).
7. Run firebase use --add from the repository root and select the Numvote project. Create a local .firebaserc; it is git-ignored.
8. Set the teacher PIN as a server-side Secret: firebase functions:secrets:set TEACHER_PIN. Enter exactly four digits. The PIN is not embedded in the frontend.
9. Install and deploy:
   cd functions
   npm install
   cd ..
   firebase deploy --only firestore:rules,functions
10. Deploy hosting with firebase deploy --only hosting.

## Operation

The teacher enters the server-configured PIN, creates a session, and shares the invitation URL. Students opening that URL receive student-only access. The teacher can publish a typed question, independently toggle Question Display and Accept Responses, and view the total and top five answer values. No individual response history is stored.

## Data and security

Student clients cannot directly write session settings or answer aggregates. The submitAnswer callable checks Accept Responses inside the same Firestore transaction that increments the answer count and session total. If disabled, neither counter is changed, and the student receives no disabled-state notification.

Students subscribe to one session document. The teacher subscribes to that document and a top-five aggregate query. There is no polling. Each attempted submission reads the session, membership, and matching aggregate documents in a server-side transaction. This is the trade-off for reliable enforcement and exact counts without retaining individual submissions.

The four-digit PIN is a lightweight gate, not strong authentication. The callable applies per-IP throttling, but a four-digit PIN remains brute-forceable over time. Use a unique PIN and consider stronger teacher authentication before using this for sensitive classes. Firebase App Check is not enforced in this initial version; configure it before production use. Anonymous authentication does not identify students; membership is tied to the anonymous Firebase UID on that browser/device.

No project credentials, deployment, or live classroom test are included in this source commit. Complete the Firebase setup above before using with students.
