# Quiz Master Pro

I need a web application: **Quiz System** with an admin panel.

- **Tech stack:** React/Vite frontend, use Supabase for backend (PostgreSQL database, Auth, Storage, Realtime). Host on Lovable Cloud or Vercel.

- **Authentication:** Admins login with email/password (Supabase Auth). Participants login by entering **unit** and **callsign**. After login, bind participant to device (store a session token in cookie/localStorage). Use JWT or similar tokens.

- **Data models:** Tables: 

  - `users` (id, name, email, password_hash, role), 

  - `units` (id, name, description), 

  - `participants` (id, unit_id, callsign, device_token), unique index on (unit_id, callsign), 

  - `quizzes` (id, title, description, created_by, timestamps), 

  - `questions` (id, quiz_id, text, media_url, media_type, order), 

  - `answers` (id, question_id, text, is_correct), 

  - `attempts` (id, participant_id, quiz_id, start_time, end_time, score), 

  - `responses` (id, attempt_id, question_id, answer_id). 

Include foreign keys and necessary indexes (e.g., index on quiz_id, participant_id).

- **API endpoints:** Provide RESTful endpoints, for example: 

  - `POST /api/auth/login` (admin auth), 

  - `POST /api/participants/login` (participant auth), 

  - `GET/POST/PUT/DELETE /api/quizzes`, 

  - `POST /api/quizzes/{quiz_id}/questions`, 

  - `POST /api/questions/{q_id}/answers`, 

  - `POST /api/attempts` (start attempt), 

  - `POST /api/attempts/{id}/responses` (save answer), 

  - `PUT /api/attempts/{id}` (finish attempt), 

  - endpoints for stats: `GET /api/stats/quiz/{quiz_id}`, `GET /api/stats/unit/{unit_id}`. 

Return JSON with success indicators and objects.

- **Features:** 

  - Admin UI to create/edit quizzes, add questions/answers, upload images/videos, manage users/units. 

  - Participant UI to login (unit/callsign), take quiz question by question. Show image/video in questions. 

  - Real-time statistics dashboard for admin (use Supabase realtime subscriptions). 

  - Prevent duplicate participations: bind session to device (cookie).  

- **UI/UX:** 

  - Ukrainian labels, e.g. “Створити квіз”, “Додати запитання”, “Оберіть відповідь”, “Вхід: підрозділ і позивний”. 

  - Admin panel: pages for Quiz List, Question Editor, Stats. Participant: login page and quiz page. 

  - Use clean design (e.g., tabs or steps for questions). 

- **Example data:** 

  - Quizzes: “Історичні події”, “Технічні навички”. 

  - Units: {id:1, name:"1-й батальйон"}, {id:2, name:"2-й батальйон"}. 

  - Participants: {id:10, unit_id:1, callsign:"ALPHA"}, {id:11, unit_id:2, callsign:"ALPHA"}. 

- **Output:** After generation, include: JSON project structure, data models, and example API calls (with JSON request/response).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://callsign-quiz-hero.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c43ca6dd-ecf8-403a-aacf-951e25a9afc4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Run with Docker

Docker Compose builds the production web image locally and starts the app on port 3000. The standalone Docker configuration stores quizzes, participants, attempts, branding, and admin accounts in a local JSON database volume; Supabase credentials are not required.

1. (Optional) Copy `.env.example` to `.env` if you want to change the host port.
2. Build and start the image:

   ```sh
   docker compose up --build -d
   ```

3. Open [http://localhost:3000](http://localhost:3000). On first use, open **Вхід для адміністратора → Немає акаунта? Зареєструватись** to create the first administrator. After this account is created, public admin registration is closed; the main administrator can add other admins in the panel. The participant page is seeded with two sample units and quizzes.
4. To stop the app, run `docker compose down`. The named `quiz-data` volume preserves data; `docker compose down -v` deletes that database.

This standalone mode stores uploaded media as data URLs in its JSON database, so keep uploads modest in size. It is intended for a single local instance and is not a replacement for a managed multi-user production database.
