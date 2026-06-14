const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const { exec } = require('child_process');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');

const app  = express();
const port = process.env.PORT || 3000;

// Allow requests from anywhere (PWA on Netlify)
app.use(cors());
app.use(express.json());

// Multer — store upload in temp dir
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'TIELCO Gas Geotagger EXIF Server' });
});

// ── Tag photo endpoint ────────────────────────────────────────
app.post('/tag', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded.' });
  }

  const { lat, lon, station, address } = req.body;

  if (!lat || !lon || !station || !address) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (isNaN(latNum) || isNaN(lonNum)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Invalid GPS coordinates.' });
  }

  // Rename to .jpg for exiftool
  const inputPath  = req.file.path;
  const outputPath = inputPath + '_tagged.jpg';
  fs.copyFileSync(inputPath, outputPath);

  const now     = new Date();
  const pad     = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}:${pad(now.getMonth()+1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const desc    = `${station} - ${address}`;

  const latRef = latNum >= 0 ? 'N' : 'S';
  const lonRef = lonNum >= 0 ? 'E' : 'W';

  const cmd = [
    'exiftool',
    '-overwrite_original',
    `-GPSLatitude=${Math.abs(latNum)}`,
    `-GPSLatitudeRef=${latRef}`,
    `-GPSLongitude=${Math.abs(lonNum)}`,
    `-GPSLongitudeRef=${lonRef}`,
    `-GPSMapDatum=WGS-84`,
    `-ImageDescription=${desc}`,
    `-Artist=TIELCO Gas Geotagger`,
    `-Copyright=TIELCO ${now.getFullYear()}`,
    `-DateTime="${dateStr}"`,
    `-DateTimeOriginal="${dateStr}"`,
    `-XPTitle=${station}`,
    `-XPSubject=${address}`,
    `-Keywords=TIELCO`,
    `-Comment=Tagged by TIELCO Gas Geotagger | ${station} | ${address} | GPS:${latNum},${lonNum}`,
    `"${outputPath}"`,
  ].join(' ');

  exec(cmd, (err, stdout, stderr) => {
    // Clean up input
    fs.unlink(inputPath, () => {});

    if (err) {
      fs.unlink(outputPath, () => {});
      console.error('ExifTool error:', stderr);
      return res.status(500).json({ error: 'ExifTool failed: ' + stderr });
    }

    // Send tagged file back
    const safeName  = station.replace(/[^a-zA-Z0-9]/g, '_');
    const ts        = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename  = `TIELCO_${safeName}_${ts}.jpg`;

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Filename', filename);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => fs.unlink(outputPath, () => {}));
    stream.on('error', () => {
      fs.unlink(outputPath, () => {});
      res.status(500).json({ error: 'Failed to send file.' });
    });
  });
});

app.listen(port, () => {
  console.log(`TIELCO EXIF Server running on port ${port}`);
});
