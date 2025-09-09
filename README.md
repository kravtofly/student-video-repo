# student-video-repo
Student Video Repository (SVR) MVP for Krāv.   Direct uploads → Mux • Mux webhooks → Supabase • Signed playback • Coach review page.
# Krāv – Student Video Repository (SVR)

MVP for Krāv’s Student Video Repository.  
Handles **direct uploads → Mux**, **Mux webhooks → Supabase**, **signed playback**, and a **basic coach review page**.

---

## 🚀 Tech Stack
- **Frontend/Hosting**: Next.js on Vercel  
- **Auth**: Memberstack (planned integration)  
- **Database**: Supabase (videos + profiles)  
- **Video**: Mux (uploads, assets, playback)  
- **Automation**: Make.com (future email + workflow automations)

---

## 🛠 Features (MVP)
- Direct browser uploads to Mux  
- Webhooks update Supabase when assets are ready  
- Signed playback tokens for secure streaming  
- Coach Review page to list and watch student videos

---

## 🔧 Quickstart
1. Clone the repo  
   ```bash
   git clone git@github.com:kravtofly/student-video-repo.git
   cd student-video-repo
