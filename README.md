# Jokothread Backend

API Server berbasis Node.js dan Express untuk mendukung aplikasi Jokothread. Backend ini bertindak sebagai *middleware orchestrator* yang menghubungkan aplikasi **Jokothread** dengan database PostgreSQL via Supabase Pool, menangani logika kueri kompleks, autentikasi, serta pembatasan akses data (*middleware authorization*).

## Struktur Arsitektur Backend

Aplikasi ini menggunakan pola arsitektur MVC (Model-Controller-Routes) tanpa layer Model tebal karena skema data dikelola langsung pada level database PostgreSQL (Supabase).

- **`index.js`**: Titik masuk utama aplikasi, inisialisasi server Express, konfigurasi CORS multi-origin, middleware global, dan pendaftaran rute API.
- **`config/db.js`**: Manajemen koneksi database pooling ke PostgreSQL menggunakan library `pg`.
- **`controllers/`**: Berisi logika bisnis inti dari setiap fitur dan eksekusi kueri SQL mentah (*raw queries*).
- **`middleware/`**: Interseptor permintaan, terutama `authMiddleware.js` untuk memvalidasi token JWT dari Supabase Auth/Custom JWT sebelum mengizinkan rute terproteksi berjalan.
- **`routes/`**: Pemetaan endpoint URL API dan pencocokan dengan fungsi controller yang sesuai.

---

## Spesifikasi Endpoint API

Semua rute API di bawah ini menggunakan basis rute langsung dari root server Express sesuai konfigurasi routing.

### 1. Rute Dasar
| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GET** | `/` | Publik | Health check untuk memastikan status API sedang berjalan (`API Running`). |

---

### 2. Rute Pengguna (`/users`)

| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GET** | `/users` | Publik | Mengambil daftar seluruh pengguna yang terdaftar di dalam sistem. |
| **GET** | `/users/:id` | Publik / Opsional | Mengambil detail profil pengguna berdasarkan ID, termasuk status follow, request, dan block apabila pengguna sedang login. |
| **POST** | `/users/register` | Publik | Melakukan registrasi akun baru dan mengirim kode OTP verifikasi ke email pengguna. |
| **POST** | `/users/verify-otp` | Publik | Memverifikasi kode OTP untuk mengaktifkan akun pengguna baru. |
| **POST** | `/users/login` | Publik | Melakukan autentikasi akun menggunakan email dan password lalu menghasilkan token JWT. |
| **POST** | `/users/google` | Publik | Login atau registrasi akun menggunakan Google OAuth. |
| **PUT** | `/users/:id` | Publik | Memperbarui data profil pengguna seperti nama, username, email, avatar, dan bio. |
| **DELETE** | `/users/:id` | Publik | Menghapus akun pengguna secara permanen dari sistem. |
| **PATCH** | `/users/privacy` | Terproteksi | Mengubah status privasi akun pengguna menjadi publik atau privat. |
| **GET** | `/users/blocked-list` | Terproteksi | Mengambil daftar seluruh akun yang telah diblokir oleh pengguna saat ini. |
| **POST** | `/users/:id/follow` | Terproteksi | Mengikuti atau berhenti mengikuti (*unfollow*) pengguna target menggunakan sistem *toggle*. |
| **POST** | `/users/:id/block` | Terproteksi | Memblokir atau membuka blokir (*unblock*) pengguna target menggunakan sistem *toggle*. |
| **POST** | `/users/requests/:senderId` | Terproteksi | Menerima atau menolak permintaan mengikuti (*follow request*) dari pengguna lain. |

---

### 3. Rute Password (`/users/password`)

| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **POST** | `/users/password/request-otp` | Terproteksi | Mengirim kode OTP ke email pengguna untuk proses perubahan password. |
| **PUT** | `/users/password/update` | Terproteksi | Memperbarui password akun menggunakan verifikasi OTP. |

---

### 4. Rute Kiriman (`/posts`)

| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GET** | `/posts` | Publik / Opsional | Mengambil daftar *feeds* postingan global maupun postingan spesifik pengguna tertentu (`?user_id=`). Mendukung pagination (`?offset=0&limit=10`) serta pengecekan status *like* apabila pengguna sedang login. |
| **GET** | `/posts/search` | Publik / Opsional | Melakukan pencarian postingan dan pengguna menggunakan kata kunci tertentu (`?q=keyword`). |
| **POST** | `/posts` | Terproteksi | Membuat postingan atau *thread* baru ke dalam sistem. |
| **DELETE** | `/posts/delete/:id` | Terproteksi | Menghapus postingan tertentu berdasarkan ID postingan. |
| **GET** | `/posts/:id` | Publik / Opsional | Mengambil detail lengkap dari satu postingan tertentu berdasarkan ID. |
| **POST** | `/posts/:id/like` | Terproteksi | Menyukai atau batal menyukai (*unlike*) postingan menggunakan sistem *toggle*. |
| **GET** | `/posts/:id/replies/count` | Publik | Mengambil jumlah total komentar atau balasan dari suatu postingan. |
| **POST** | `/posts/:id/replies` | Terproteksi | Mengirim komentar atau balasan baru pada postingan tertentu. |
| **GET** | `/posts/:id/replies` | Publik | Mengambil daftar seluruh komentar atau balasan dari postingan tertentu. |

---

### 5. Rute Notifikasi (`/notifications`)

| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GET** | `/notifications` | Terproteksi | Mengambil seluruh daftar notifikasi milik pengguna yang sedang login. |
| **GET** | `/notifications/unread-count` | Terproteksi | Mengambil jumlah notifikasi yang belum dibaca oleh pengguna. |
| **PATCH** | `/notifications/:id/read` | Terproteksi | Menandai notifikasi tertentu sebagai telah dibaca. |

---

### 6. Rute Pesan (`/messages`)

| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GET** | `/messages/contacts` | Terproteksi | Mengambil daftar kontak percakapan pengguna. |
| **GET** | `/messages/:id` | Terproteksi | Mengambil riwayat percakapan antara pengguna saat ini dengan pengguna target. |
| **POST** | `/messages/:id` | Terproteksi | Mengirim pesan baru kepada pengguna target. |
| **PUT** | `/messages/:id/read` | Terproteksi | Menandai seluruh pesan dalam percakapan sebagai telah dibaca. |

---

### 7. Rute Eksplorasi (`/explore`)

| Method | Endpoint | Proteksi | Deskripsi |
| :--- | :--- | :--- | :--- |
| **GET** | `/explore/suggestions` | Publik | Mengambil daftar rekomendasi akun atau konten populer untuk halaman eksplorasi pengguna. |

### 8. Panduan Pemasangan Lokal

1. Clone Repository
```bash
git clone https://github.com/FrenzY8/Jokothread-Backend.git
cd Jokothread-Backend
```

2. Salin Environment Variables
Buat berkas bernama .env pada direktori root Jokothread-Backend dengan menyalin format dari .env.example:

```env
PGHOST=
PGPORT=5432
PGDATABASE=postgres
PGUSER=
PGPASSWORD=
JWT_SECRET=
GOOGLE_CLIENT_ID=
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM_NAME=
```
Catatan Keamanan: Dapatkan string koneksi database (DATABASE_URL) melalui pengaturan dasbor database Supabase Anda pada bagian Connection Pooling string.

3. Jalankan Server
Eksekusi perintah berikut secara berurutan pada terminal:
```node
# Masuk ke direktori backend (jika belum)
cd Jokothread-Backend

# Instal seluruh dependensi modul Node.js
npm install

# Jalankan server dalam mode pengembangan
npm run dev
```

Server backend akan aktif dan siap mendengarkan request dari aplikasi React pada port http://localhost:5000.
