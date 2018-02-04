import Retriever, {Config as BaseConfig} from './Retriever'
import Observable, {Subscription} from './Observable'

export interface Config<T>  extends BaseConfig<T> {
    getter():Observable<T>
}

export default class ObservableRetriever<T> extends Retriever<T> {
    constructor(config:Config<T>) {
        super(config)
        this.getter = config.getter
    }

    protected getter: () => Observable<T>
    protected subscription: Subscription | null


    get() {
        const observable:Observable<T>|null = this.getter();
        if (this.subscription) {
            this.subscription.unsubscribe()
            this.subscription = null
        }    
        this.subscription = observable.subscribe(this.onData, this.onError);
    }

    onDestroy() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null
        }
    }

}