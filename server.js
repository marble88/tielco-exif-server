const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const { exec } = require('child_process');
const fs       = require('fs');
const os       = require('os');

const app  = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => {
  // Check if exiftool is available
  exec('exiftool -ver', (err, stdout) => {
    res.json({
      status: 'ok',
      service: 'TIELCO Gas Geotagger EXIF Server',
      exiftool: err ? 'NOT FOUND - ' + err.message : 'v' + stdout.trim(),
    });
  });
});

// ── Tag photo endpoint ────────────────────────────────────────
app.post('/tag', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });

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

  const inputPath  = req.file.path;
  const outputPath = inputPath + '.jpg';

  // Copy file with .jpg extension for exiftool
  fs.copyFile(inputPath, outputPath, (copyErr) => {
    if (copyErr) {
      fs.unlink(inputPath, () => {});
      return res.status(500).json({ error: 'File copy failed.' });
    }

    const now    = new Date();
    const pad    = n => String(n).padStart(2, '0');
    const dtStr  = `${now.getFullYear()}:${pad(now.getMonth()+1)}:${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const latRef = latNum >= 0 ? 'N' : 'S';
    const lonRef = lonNum >= 0 ? 'E' : 'W';
    const desc   = `${station} - ${address}`;

    const args = [
      '-overwrite_original',
      `-GPSLatitude=${Math.abs(latNum)}`,
      `-GPSLatitudeRef=${latRef}`,
      `-GPSLongitude=${Math.abs(lonNum)}`,
      `-GPSLongitudeRef=${lonRef}`,
      `-GPSMapDatum=WGS-84`,
      `-ImageDescription="${desc}"`,
      `-Artist="TIELCO Gas Geotagger"`,
      `-DateTime="${dtStr}"`,
      `-DateTimeOriginal="${dtStr}"`,
      `-Comment="Station: ${station} | Address: ${address} | GPS: ${latNum},${lonNum}"`,
    ].join(' ');

    const cmd = `exiftool ${args} "${outputPath}"`;

    exec(cmd, { timeout: 20000 }, (err, stdout, stderr) => {
      fs.unlink(inputPath, () => {});

      if (err) {
        fs.unlink(outputPath, () => {});
        console.error('ExifTool error:', stderr || err.message);
        return res.status(500).json({ error: 'ExifTool failed: ' + (stderr || err.message) });
      }

      const now2   = new Date();
      const safeName = station.replace(/[^a-zA-Z0-9]/g, '_');
      const ts     = `${now2.getFullYear()}${pad(now2.getMonth()+1)}${pad(now2.getDate())}_${pad(now2.getHours())}${pad(now2.getMinutes())}`;
      const filename = `TIELCO_${safeName}_${ts}.jpg`;

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      stream.on('end', () => fs.unlink(outputPath, () => {}));
      stream.on('error', (e) => {
        fs.unlink(outputPath, () => {});
        if (!res.headersSent) res.status(500).json({ error: 'Stream error.' });
      });
    });
  });
});

app.listen(port, () => console.log(`TIELCO EXIF Server on port ${port}`));
