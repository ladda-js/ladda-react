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

    get() {
        this.getter().then(this.onData, this.onError)
    }

    destroy() {
        // Do nothing
    }
}