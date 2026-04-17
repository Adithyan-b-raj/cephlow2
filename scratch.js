import QRCode from "qrcode";
import fs from "fs";

QRCode.toFileStream(fs.createWriteStream("test.png"), "test")
  .then(() => console.log("success"))
  .catch(console.error);
