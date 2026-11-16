import { connect } from './db.js';
import { createApp } from './app.js';

const app = createApp();
const PORT = Number(process.env.PORT) || 3000;

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Entry Market dashboard berjalan di http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('Gagal konek MongoDB:', e.message);
    process.exit(1);
  });
