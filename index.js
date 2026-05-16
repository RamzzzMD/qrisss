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