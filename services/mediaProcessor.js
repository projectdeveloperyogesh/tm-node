const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class MediaProcessor {
    constructor(uploadDir = "uploads", processedDir = "processed") {
        this.uploadDir = uploadDir;
        this.processedDir = processedDir;

        if (!fs.existsSync(this.uploadDir)) fs.mkdirSync(this.uploadDir, { recursive: true });
        if (!fs.existsSync(this.processedDir)) fs.mkdirSync(this.processedDir, { recursive: true });
    }

    async processMediaFile(sourceFilePath) {
        if (!fs.existsSync(sourceFilePath)) {
            throw new Error(`Media file not found: ${sourceFilePath}`);
        }

        const ext = path.extname(sourceFilePath).toLowerCase();
        const baseName = path.basename(sourceFilePath, ext);
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        const targetWav = path.join(this.processedDir, `${baseName}_${timestamp}.wav`);

        if (ext === '.wav') {
            return sourceFilePath;
        }

        return new Promise((resolve) => {
            const cmd = `ffmpeg -y -i "${sourceFilePath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${targetWav}"`;
            exec(cmd, (error) => {
                if (!error && fs.existsSync(targetWav) && fs.statSync(targetWav).size > 0) {
                    resolve(targetWav);
                } else {
                    resolve(sourceFilePath);
                }
            });
        });
    }
}

module.exports = MediaProcessor;
