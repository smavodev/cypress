import type { AppCaptureProtocolInterface, CDPClient, ResponseEndedWithEmptyBodyOptions, ResponseStreamOptions } from '@packages/types'
import type { Readable } from 'stream'

export class AppCaptureProtocol implements AppCaptureProtocolInterface {
  getDbMetadata (): { offset: number, size: number } {
    return {
      offset: 0,
      size: 0,
    }
  }
  beforeSpec ({ archivePath, db }): void {
    throw new Error('Error in beforeSpec')
  }
  responseStreamReceived (options: ResponseStreamOptions): Readable {
    return options.responseStream
  }
  addRunnables (runnables: any): void {}
  commandLogAdded (log: any): void {}
  commandLogChanged (log: any): void {}
  viewportChanged (input: any): void {}
  urlChanged (input: any): void {}
  beforeTest (test: Record<string, any>): Promise<void> {
    return Promise.resolve()
  }
  preAfterTest (test: Record<string, any>, options: Record<string, any>): Promise<void> {
    return Promise.resolve()
  }
  afterTest (test: Record<string, any>): Promise<void> {
    return Promise.resolve()
  }
  afterSpec (): Promise<void> {
    return Promise.resolve()
  }
  connectToBrowser (cdpClient: CDPClient): Promise<void> {
    return Promise.resolve()
  }
  pageLoading (input: any): void {}
  resetTest (testId: string): void {}
  responseEndedWithEmptyBody: (options: ResponseEndedWithEmptyBodyOptions) => {}
}
