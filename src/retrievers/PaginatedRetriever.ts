import Retriever, {Config as BaseConfig} from './Retriever'
import Page from './Page'

interface Config<T> extends BaseConfig<T> {
    getter: (pager:Page) => Promise<T>
    getNextPage: (currentPage?:Page) => Page
}

export default class PaginatedRetriever<T extends any[]> extends Retriever<T> {
    constructor(config:Config<T>) {
        super(config)
        this.getter = config.getter
        this.getNextPage = config.getNextPage
        this.queueNext()
    }

    protected getter: (pager:Page) => Promise<T>
    protected getNextPage: (currentPage?:Page) => Page
    protected pages: Page[] = []

    get() {
        this.queueNext()
        this.getJoinedResults()
    }

    protected async getJoinedResults() {
        try {
            const results = await Promise.all(this.pages.map(this.getter))
            const joinedResults:T = <T>Array.prototype.concat(...results)
            this.onData(joinedResults)
        } catch(e) {
            this.onError(e)
        }
    }

    protected queueNext() {
        const prevPage:Page|undefined = this.pages[this.pages.length - 1]
        const nextPage = this.getNextPage(prevPage);
        this.pages = [...this.pages, nextPage]
    }

    destroy() {
        // nothing to do
    }
}