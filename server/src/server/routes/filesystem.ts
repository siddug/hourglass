import { FastifyPluginAsync } from 'fastify';
import { readdirSync, readFileSync, statSync, existsSync, createReadStream } from 'node:fs';
import { join, extname, basename } from 'node:path';
import archiver from 'archiver';
import { expandHome } from '../../utils/paths.js';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.webm': 'audio/webm',
};

const filesystemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/filesystem/list', async (request, reply) => {
    const { path: rawPath, showHidden } = request.query as {
      path?: string;
      showHidden?: string;
    };

    if (!rawPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const resolvedPath = expandHome(rawPath);

    if (!existsSync(resolvedPath)) {
      return reply.status(400).send({ error: `Path does not exist: ${rawPath}` });
    }

    let stat;
    try {
      stat = statSync(resolvedPath);
    } catch {
      return reply.status(400).send({ error: `Cannot access path: ${rawPath}` });
    }

    if (!stat.isDirectory()) {
      return reply.status(400).send({ error: `Path is not a directory: ${rawPath}` });
    }

    const includeHidden = showHidden === 'true';

    try {
      const dirEntries = readdirSync(resolvedPath, { withFileTypes: true });

      const entries = dirEntries
        .filter((entry) => {
          if (!includeHidden && entry.name.startsWith('.')) return false;
          return true;
        })
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
          path: join(resolvedPath, entry.name),
        }))
        .sort((a, b) => {
          // Directories first, then files, alphabetical within each group
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      return { path: resolvedPath, entries };
    } catch (err) {
      return reply.status(403).send({
        error: `Permission denied: ${rawPath}`,
      });
    }
  });

  fastify.get('/filesystem/read', async (request, reply) => {
    const { path: rawPath } = request.query as { path?: string };

    if (!rawPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const resolvedPath = expandHome(rawPath);

    if (!existsSync(resolvedPath)) {
      return reply.status(404).send({ error: `File not found: ${rawPath}` });
    }

    let stat;
    try {
      stat = statSync(resolvedPath);
    } catch {
      return reply.status(400).send({ error: `Cannot access path: ${rawPath}` });
    }

    if (stat.isDirectory()) {
      return reply.status(400).send({ error: `Path is a directory, not a file: ${rawPath}` });
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      return { path: resolvedPath, content };
    } catch {
      return reply.status(403).send({ error: `Permission denied: ${rawPath}` });
    }
  });

  // Serve raw file content with appropriate Content-Type (for images, etc.)
  fastify.get('/filesystem/raw', async (request, reply) => {
    const { path: rawPath } = request.query as { path?: string };

    if (!rawPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const resolvedPath = expandHome(rawPath);

    if (!existsSync(resolvedPath)) {
      return reply.status(404).send({ error: `File not found: ${rawPath}` });
    }

    let stat;
    try {
      stat = statSync(resolvedPath);
    } catch {
      return reply.status(400).send({ error: `Cannot access path: ${rawPath}` });
    }

    if (stat.isDirectory()) {
      return reply.status(400).send({ error: `Path is a directory, not a file: ${rawPath}` });
    }

    try {
      const ext = extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileSize = stat.size;
      const rangeHeader = request.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        reply.raw.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });

        createReadStream(resolvedPath, { start, end }).pipe(reply.raw);
        return reply;
      }

      const content = readFileSync(resolvedPath);
      return reply
        .header('Content-Type', contentType)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', fileSize)
        .header('Cache-Control', 'no-cache')
        .send(content);
    } catch {
      return reply.status(403).send({ error: `Permission denied: ${rawPath}` });
    }
  });
  // Download a directory as a zip archive
  fastify.get('/filesystem/download', async (request, reply) => {
    const { path: rawPath } = request.query as { path?: string };

    if (!rawPath) {
      return reply.status(400).send({ error: 'path query parameter is required' });
    }

    const resolvedPath = expandHome(rawPath);

    if (!existsSync(resolvedPath)) {
      return reply.status(400).send({ error: `Path does not exist: ${rawPath}` });
    }

    let stat;
    try {
      stat = statSync(resolvedPath);
    } catch {
      return reply.status(400).send({ error: `Cannot access path: ${rawPath}` });
    }

    if (!stat.isDirectory()) {
      return reply.status(400).send({ error: `Path is not a directory: ${rawPath}` });
    }

    const folderName = basename(resolvedPath);
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.on('error', (err) => {
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: `Archive error: ${err.message}` });
      }
    });

    reply.raw.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
    });

    archive.pipe(reply.raw);
    archive.directory(resolvedPath, folderName);
    await archive.finalize();

    return reply;
  });
};

export default filesystemRoutes;
