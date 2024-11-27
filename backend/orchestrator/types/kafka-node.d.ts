declare module 'kafka-node' {
    interface ProducerStream {
      _write: (message: any, encoding: string, cb: (error?: Error | null) => void) => void;
    }
  }
  