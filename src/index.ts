import * as http from 'node:http';
import os from 'node:os';
import fs, { stat } from 'node:fs';
import path from 'node:path';
import util from 'node:util';

const PORT = 3000;

const readdirPromise = util.promisify(fs.readdir);
const statPromise = util.promisify(fs.stat);

const server = http.createServer(async (req, res) => {
  const method = req.method;

  const urlParsed = new URL(req.url as string, `http://${req.headers.host}`);
  const pathName = urlParsed.pathname;

  try {
    if (method === 'GET') {
      if (pathName === '/') {
        res.statusCode = 200;
        return res.end("Bienvenue sur l'API");
      } else if (pathName === '/system-info') {
        const cpus = os.cpus();
        res.end(JSON.stringify({
          platform: os.platform(),
          arch: os.arch(),
          type: os.type(),
          release: os.release(),
          hostname: os.hostname(),
          uptime: os.uptime(),
          totalMemoryGB: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2),
          freeMemoryGB: (os.freemem() / 1024 / 1024 / 1024).toFixed(2),
          cpuCount: cpus.length,
          cpuModel: cpus.length > 0 ? cpus[0].model : 'N/A',
          processId: process.pid,
          nodeVersion: process.version,
          env: process.env.NODE_ENV || 'development'
        }));
      } else if (pathName === '/files') {
        const currentFolder = process.cwd();
        const files = await readdirPromise(currentFolder);

        const statFilesPromises = files.map(async (file) => {
          try {
            const filePath = path.join(currentFolder, file);
            const stats = await statPromise(filePath);
            return {
              name: file,
              type: stats.isDirectory() ? 'directory' : 'file',
              size: stats.size,
              lastModified: stats.mtime.toISOString() // Format ISO pour la date
            };
          } catch (error) {
            return { name: file, error: `Impossible d'obtenir les stats : ${(error as Error).message}` };
          }
        });

        const statFiles = await Promise.all(statFilesPromises);

        res.statusCode = 200;
        return res.end(JSON.stringify({
          currentFolder,
          files: statFiles,
        }));
      } else if (pathName.startsWith('/files/')) {
        const filename = pathName.substring('/files/'.length);
        const currentFolder = process.cwd();
        const filepath = path.join(currentFolder, filename);
        try {
          const statFile = await statPromise(filepath);
          if (!statFile.isFile()) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: `"${filename}" n'est pas un fichier.` }));
          }

          const readStream = fs.createReadStream(filepath);

          readStream.on('error', (streamErr) => {
            console.error(`Erreur de lecture du stream pour "${filename}" :`, streamErr);
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: `Erreur de streaming pour "${filename}"`, details: streamErr.message }));
            } else {
              return res.end();
            }
          });
          readStream.pipe(res);
        } catch (error) {
          return res.end(JSON.stringify({ name: filename, error: `Impossible d'obtenir les stats : ${(error as Error).message}` }));
        }
      } else {
        res.statusCode = 404;
        return res.end("This endpoint doesn't exist");
      }
    } else if (req.method === 'POST') {
      if (pathName.startsWith('/files/')) {
        const currentFolder = process.cwd();
        const filename = pathName.substring('/files/'.length);
        const filepath = path.join(currentFolder, filename);

        if (!filename || filename.trim() === '') {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Nom de fichier manquant ou invalide.' }));
        }

        const writeStream = fs.createWriteStream(filepath);
        req.pipe(writeStream);

        writeStream.on('finish', () => {
          res.statusCode = 201;
          res.end(JSON.stringify({ message: `Fichier "${filename}" créé avec succès.` }));
        });

        writeStream.on('error', (err) => {
          console.error(`Erreur lors de l'écriture du fichier "${filename}" via stream :`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `Erreur lors de la création du fichier "${filename}"`, details: err.message }));
          } else {
            res.end();
          }
        });

        req.on('error', (reqErr) => {
          console.error(`Erreur sur le stream de requête POST pour "${filename}" :`, reqErr);
          writeStream.destroy();
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `Erreur de lecture du corps de la requête : ${reqErr.message}` }));
          }
        });
      }
    }

  } catch (error) {
    console.error('Erreur interne du serveur :', error); // Loguer l'erreur pour le débogage
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Une erreur interne inattendue est survenue.', details: (error as Error).message }));
  }

});

server.listen(PORT, () => {
  console.log('port is listening on port', PORT);
});