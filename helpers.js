const fs = require('fs');

class Helpers {

  static async pngToBase64(filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(err);
            return;
        }
        const base64Data = Buffer.from(data).toString('base64');
        const dataUrl = `data:image/png;base64,${base64Data}`;
        console.log(dataUrl);
    });
  }

}

module.exports = Helpers;
