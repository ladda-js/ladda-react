export interface Config<T> {
    onData(data:T):void
    onError(error:Error):void
}

export default abstract class Retriever<T> {
    constructor(config:Config<T>) {
        this.onData = config.onData
        this.onError = config.onError
    }

    abstract onDestroy():void

    protected onData: (data:T) => void

    protected onError: (error:Error) => void

}