# Invoice Auth App

Vite + React + TypeScript + Tailwind + Supabase Auth.

## Start

```bash
npm install
copy .env.example .env
npm run dev
```

Legg inn Supabase-verdiene i `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Supabase

Ga til Supabase dashboard:

- Authentication -> Providers -> Email
- Aktiver email/password login
- Kopier Project URL og anon public key til `.env`
