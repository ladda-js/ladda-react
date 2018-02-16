import Retriever, {Config as BaseConfig} from './Retriever'

export interface Config<T> extends BaseConfig<T> {
    getter():Promise<T>
}

export default class ResolveRetriever<T> extends Retriever<T> {
    constructor(config:Config<T>) {
        super(config)
        this.getter = config.getter
    }

    protected getter:Config<T>['getter']

    async get() {
        try {
            const data = await this.getter()
            this.onData(data)
            return data
        } catch (e) {
            this.onError(e)    
            throw e
        }
    }

    destroy() {
        // Do nothing
    }
}