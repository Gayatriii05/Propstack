const bcrypt = require('bcrypt');
const plain = process.argv[2];
if (!plain) {
  console.log('Usage: node hashPassword.js <plaintext>');
  process.exit(1);
}
bcrypt.hash(plain, 10).then((hash) => console.log(hash));
