export default {
  server: {
    port: 5273,
    strictPort: true,
    host: '127.0.0.1',
  },
  optimizeDeps: {
    include: ['p5', '@mediapipe/tasks-vision'],
  },
};
