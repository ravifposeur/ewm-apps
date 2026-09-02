# EWM-Apps: Event Waste Management Platform

## 👥 Pembagian Peran Kelompok (A.1)
| Periode | Contract Owner | Service Owner | Client Owner | Integration Owner |
| :--- | :--- | :--- | :--- | :--- |
| **Pertemuan 1-3** | Ravif Gayuh Wicaksono | Revy Satya Gunawan | Hammam Muhammad Yazid | Abdul Hamid Awludin Ardiansyah |
| **Pertemuan 4-6** | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Pertemuan 7-9** | _TBD_ | _TBD_ | _TBD_ | _TBD_ |
| **Pertemuan 10-12** | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

## 📖 Domain Sistem
Platform ini digunakan oleh penyedia jasa waste management untuk mengelola daur ulang sampah di berbagai event. Petugas lapangan mencatat timbangan sampah secara offline di venue. Data disinkronkan di akhir hari. Admin memverifikasi data dan mengonfirmasi akhir event. Konfirmasi ini menerbitkan sertifikat dan poin untuk event organizer. Proses ini tidak boleh terjadi dua kali.

### ✅ Pemeriksaan 4 Syarat Wajib:
1. **Minimal 3 aktor**: Event Organizer (klien), Petugas Lapangan (offline), Admin Vendor.
2. **Operasi unsafe & konsekuensial**: Konfirmasi akhir event (menerbitkan sertifikat bagi EO sesuai poin). Tidak boleh double.
3. **Aktor offline**: Petugas Lapangan (sinyal hilang di venue padat).
4. **Cakupan kecil**: Satu siklus utuh ( catat offline → data sinkron → verifikasi → terbit sertifikat).

## 📊 Taksonomi 5 Sumbu Klien

##    Dekomposisi Aturan Bisnis
**Aturan**: "Selisih berat catatan petugas dengan timbangan depot tidak boleh lebih dari 10%, jika lebih maka konfirmasi ditolak."

| Lapisan | Peran terhadap Aturan |
| :--- | :--- |
| **Service** | **Menegakkan**. Server menghitung selisih persentase. Jika > 10%, tolak dengan 422. |
| **Kontrak** | **Menyatakan**. `POST /confirmation` mengembalikan 422 dengan field `deviationPercentage`. |
| **Klien** | **Memprediksi**. Web Admin menampilkan peringatan visual jika selisih mendekati 10%, menyembunyikan tombol konfirmasi jika sudah lewat. |
