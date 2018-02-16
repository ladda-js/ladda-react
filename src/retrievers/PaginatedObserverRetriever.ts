import Retriever, {Config as BaseConfig} from './Retriever'
import Observable, { Subscription } from './Observable';
import Page from './Page';

interface Config<T> extends BaseConfig<T[]> {
    getter: (pager:Page) => Observable<T[]>
    getNextPage: (currentPage?:Page) => Page
}

class PageSubscription<T> {
    constructor(page:Page) {
        this.page = page
    }
    subscription: null|Subscription = null
    firstLoad: boolean = false
    page: Page
    data?: T
    
    get(getter:(page:Page) => Observable<T>, onData:(data:T)=>void, onError:(e:Error)=>void) {
        if (this.subscription) return
        
        this.firstLoad = true
        this.subscription = getter(this.page).subscribe(
            (data) => {
                this.data = data
                this.firstLoad = false
                onData(data)
            },
            onError
        )
    }
}

export default class PaginatedObserveRetriever<T> extends Retriever<T[]> {
    constructor(config:Config<T>) {
        super(config)
        this.getter = config.getter
        this.getNextPage = config.getNextPage
        this.queueNext()
    }

    protected getter: (pager:Page) => Observable<T[]>
    protected getNextPage: (currentPage?:Page) => Page
    protected subscriptions: PageSubscription<T[]>[] = []

    get() {
        this.queueNext()
        this.getJoinedResults()
    }

    isLoading() {
        return this.subscriptions.some(page => !page.data)
    }

    protected getJoinedResults() {
        this.subscriptions = this.subscriptions.map(page => {
            page.get(
                this.getter, 
                data => this.tryToPublish(),
                this.onError
            )
            return page
        })
    }

    protected tryToPublish() {
        const result = this.subscriptions.reduce<T[]|null>(
            (acc, page)=> acc && page.data ? acc.concat(page.data) : null,
            [])
        if (result) {
            this.onData(result)
        }
    }

    protected queueNext() {
        const pages = this.subscriptions.map(p => p.page)
        const prevPage:Page|undefined = pages[pages.length - 1]
        const nextPage = this.getNextPage(prevPage);
        this.subscriptions = [...this.subscriptions, new PageSubscription(nextPage)]
    }

    destroy() {
        // nothing to do
    }
}