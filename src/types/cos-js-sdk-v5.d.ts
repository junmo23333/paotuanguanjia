declare module 'cos-js-sdk-v5' {
  interface COSOptions {
    SecretId?: string
    SecretKey?: string
    getAuthorization?: (
      options: { Method: string; Key: string },
      callback: (params: {
        TmpSecretId: string
        TmpSecretKey: string
        SecurityToken: string
        ExpiredTime: number
        StartTime: number
      } | Error) => void
    ) => void
  }

  interface PutObjectParams {
    Bucket: string
    Region: string
    Key: string
    Body: string | Buffer | Blob
    ContentType?: string
  }

  interface GetObjectParams {
    Bucket: string
    Region: string
    Key: string
  }

  interface GetBucketParams {
    Bucket: string
    Region: string
    Prefix: string
  }

  interface DeleteObjectParams {
    Bucket: string
    Region: string
    Key: string
  }

  interface HeadObjectParams {
    Bucket: string
    Region: string
    Key: string
  }

  interface COSCallback {
    (err: any, data: any): void
  }

  export default class COS {
    constructor(options: COSOptions)
    putObject(params: PutObjectParams, callback: COSCallback): void
    getObject(params: GetObjectParams, callback: COSCallback): void
    getBucket(params: GetBucketParams, callback: COSCallback): void
    deleteObject(params: DeleteObjectParams, callback: COSCallback): void
    headObject(params: HeadObjectParams, callback: COSCallback): void
  }
}
