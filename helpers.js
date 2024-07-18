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

  static async runInterval(fn) {
    while (true) {
        await fn();
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  static async addToQueue(item) {
    queue.push(item);
  }

}

module.exports = Helpers;
