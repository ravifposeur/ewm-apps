# EWM-Apps: Event Waste Management Platform

## Anggota Kelompok
1. Ravif Gayuh Wicaksono (24/540583/PA/22953)
2. Revy Satya Gunawan (24/538296/PA/22835)
3. Hammam Muhammad Yazid (24/534894/PA/22687)
4. Abdul Hamid Awaludin Ardiansyah (24/540343/PA/22940)

## 👥 Pembagian Peran Kelompok
| Periode | Contract Owner | Service Owner | Client Owner | Integration Owner |
| :--- | :--- | :--- | :--- | :--- |
| **Pertemuan 1-3** | Ravif Gayuh Wicaksono | Revy Satya Gunawan | Hammam Muhammad Yazid | Abdul Hamid Awaludin Ardiansyah |
| **Pertemuan 4-6** | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Pertemuan 7-9** | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Pertemuan 10-12** | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

## 📖 Domain Sistem
Platform ini digunakan oleh penyedia jasa waste management untuk mengelola daur ulang sampah di berbagai event. Petugas lapangan mencatat timbangan sampah secara offline di venue. Data disinkronkan di akhir hari. Admin memverifikasi data dan mengonfirmasi akhir event. Konfirmasi ini menerbitkan sertifikat dan poin untuk event organizer. Proses ini tidak boleh terjadi dua kali.

### ✅ Pemeriksaan 4 Syarat Wajib:
1. **Minimal 3 aktor**: Event Organizer (klien), Petugas Lapangan (offline), Admin Vendor.
2. **Operasi unsafe & konsekuensial**: Konfirmasi akhir event (menerbitkan sertifikat bagi EO sesuai poin). Tidak boleh double.
3. **Aktor offline**: Petugas Lapangan (sinyal hilang di venue padat).
4. **Cakupan kecil**: Satu siklus utuh (catat offline → data sinkron → verifikasi → terbit sertifikat).

## 📊 Taksonomi 5 Sumbu Klien
| Sumbu / Klien | **Web Admin** | **Device Petugas** | **Web EO** | **MCP (Agen AI)** |
| :--- | :--- | :--- | :--- | :--- |
| **1. Menyimpan rahasia** | Bisa (session cookie) | Bisa (API Key di storage) | Bisa (session cookie) | Bisa (env variable) |
| **2. Ketersediaan jaringan** | Stabil (kantor) | **Sering tidak tersedia** (venue) | Stabil (kantor) | Stabil (server) |
| **3. Anggaran latensi** | 1 detik | 5 detik (timbangan) | 2 detik | 10+ detik (batch) |
| **4. Batas sumber daya** | Tak terbatas | **Terbatas** (baterai kecil) | Tak terbatas | Tak terbatas |
| **5. Ada manusia?** | Ya (Admin) | Ya (Petugas) | Ya (EO) | **Tidak** (langsung action) |

##    Dekomposisi Aturan Bisnis
**Aturan**: "Selisih berat catatan petugas dengan timbangan depot tidak boleh lebih dari 10%, jika lebih maka konfirmasi ditolak."

| Lapisan | Peran terhadap Aturan |
| :--- | :--- |
| **Service** | **Memvalidasi**. Server menghitung selisih persentase. Jika > 10%, tolak dengan 422. |
| **Contract** | **Menyatakan**. `POST /confirmation` mengembalikan 422 dengan field `deviationPercentage`. |
| **Client** | **Memprediksi**. Web Admin menampilkan peringatan visual jika selisih mendekati 10%, menyembunyikan tombol konfirmasi jika sudah lewat. |
