import app from './src/server/app.js';
import { config } from './src/server/config.js';

app.listen(config.port, () => {
  console.log(`Base de Tareas v2 disponible en ${config.appUrl}`);
});
