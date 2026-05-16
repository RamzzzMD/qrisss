const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// FUNGSI HELPER QRIS
// ==========================================

function hitungCrc16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) > 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function buatQrisDinamis(qrisStatis, nominal) {
    if (!qrisStatis || qrisStatis.length < 10) throw new Error("String QRIS tidak valid.");

    let qrisTanpaCrc = qrisStatis.substring(0, qrisStatis.length - 4);
    qrisTanpaCrc = qrisTanpaCrc.replace("010211", "010212");

    let strNominal = nominal.toString();
    let panjangNominal = strNominal.length.toString().padStart(2, '0'); 
    let tag54 = `54${panjangNominal}${strNominal}`;

    let crcIndex = qrisTanpaCrc.lastIndexOf("6304");
    if (crcIndex === -1) throw new Error("Tag 6304 tidak ditemukan pada QRIS.");
    
    let qrisBase = qrisTanpaCrc.substring(0, crcIndex);
    let payloadBaru = qrisBase + tag54 + "6304";

    let crcBaru = hitungCrc16(payloadBaru);
    return payloadBaru + crcBaru;
}

// ==========================================
// ENDPOINT API
// ==========================================

// Endpoint utama untuk generate QRIS
app.post('/api/generate-qris', async (req, res) => {
    try {
        const { qris_statis, nominal } = req.body;

        // Validasi input
        if (!qris_statis || !nominal) {
            return res.status(400).json({ 
                status: false, 
                message: "Parameter 'qris_statis' dan 'nominal' wajib diisi." 
            });
        }

        // Proses string QRIS
        const qrisDinamis = buatQrisDinamis(qris_statis, nominal);

        // Generate gambar QR Code dalam bentuk Base64
        const qrImageBase64 = await QRCode.toDataURL(qrisDinamis, {
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 400,
            margin: 2
        });

        // Kirim response JSON
        res.status(200).json({
            status: true,
            message: "QRIS Dinamis berhasil dibuat",
            data: {
                nominal: nominal,
                qris_string: qrisDinamis,
                qr_image: qrImageBase64 // Bisa langsung dipasang di <img src="..."> HTML
            }
        });

    } catch (error) {
        res.status(500).json({ 
            status: false, 
            message: "Terjadi kesalahan internal",
            error: error.message 
        });
    }
});
// ==========================================
// ENDPOINT HALAMAN WEB (URL GET)
// ==========================================

app.get('/pay', async (req, res) => {
    try {
        // Ambil nominal dari parameter URL (contoh: ?nominal=25000)
        const nominal = req.query.nominal;

        if (!nominal) {
            return res.status(400).send(`
                <h2 style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    ❌ Error: Masukkan parameter nominal di URL.<br>
                    Contoh: <b>/pay?nominal=25000</b>
                </h2>
            `);
        }

        // String QRIS Statis Anda (Bisa diambil dari database jika nanti dinamis)
        const qrisStatisToko = "00020101021126570011ID.DANA.WWW011893600915384995549902098499554990303UMI51440014ID.CO.QRIS.WWW0215ID10253822670820303UMI5204561153033605802ID5912RANZZ STORE 6015Kabupaten Bandu6105403836304C541";
        
        // Proses string QRIS
        const qrisDinamis = buatQrisDinamis(qrisStatisToko, nominal);

        // Generate gambar QR Code (Base64)
        const qrImageBase64 = await QRCode.toDataURL(qrisDinamis, {
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            },
            width: 300,
            margin: 2
        });

        // Format angka ke Rupiah
        const formatRupiah = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(nominal);

        // Render Halaman HTML dengan Tailwind CSS
        const htmlPage = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pembayaran QRIS</title>
            <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-50 flex items-center justify-center min-h-screen p-4">
            <div class="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm w-full border border-gray-100">
                <h2 class="text-2xl font-extrabold text-gray-800 mb-1">Scan untuk Membayar</h2>
                <p class="text-gray-500 font-medium mb-6">RANZZ STORE</p>
                
                <div class="flex justify-center mb-6">
                    <div class="p-3 bg-white border-4 border-blue-500 rounded-xl shadow-sm">
                        <img src="${qrImageBase64}" alt="QRIS Dinamis" class="w-full h-auto">
                    </div>
                </div>
                
                <div class="bg-blue-50 p-4 rounded-xl mb-6">
                    <p class="text-sm text-gray-600 mb-1">Total Tagihan</p>
                    <p class="text-3xl font-bold text-blue-600">${formatRupiah}</p>
                </div>
                
                <div class="text-xs text-gray-400 mt-4 flex items-center justify-center gap-2">
                    <span>💳</span> Didukung oleh QRIS & DANA
                </div>
            </div>
        </body>
        </html>
        `;

        // Kirim halaman HTML ke browser
        res.send(htmlPage);

    } catch (error) {
        res.status(500).send(`<h1>Terjadi kesalahan server: ${error.message}</h1>`);
    }
});

// Endpoint untuk test koneksi
app.get('/', (req, res) => {
    res.send("QRIS API is running smoothly! 🚀");
});

// Menjalankan server lokal (Abaikan baris ini jika deploy ke Vercel via Serverless)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server berjalan di http://localhost:${PORT}`);
    });
}

// Export app untuk keperluan Serverless Deployment (misal: Vercel)
module.exports = app;
