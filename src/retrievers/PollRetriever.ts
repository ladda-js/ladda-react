import Retriever, {Config as BaseConfig} from './ResolveRetriever'

export interface Config<T> extends BaseConfig<T> {
    interval: number
}

export default class PollRetriever<T> extends Retriever<T> {
    constructor(config: Config<T>) {
        super(config)
        this.interval = setInterval(() => this.get(), config.interval)
    }

    protected interval:number|null = null

    onDestroy() {
        if (typeof this.interval === 'number') {
            clearInterval(this.interval)
            this.interval = null
        }
    }
}