import Retriever, {Config as BaseConfig} from './Retriever'
import Cursor from './Cursor'
import Response from './Response'

interface Config<T extends any[]> extends BaseConfig<T> {
    getter(cursor:Cursor):Promise<Response<T>>
    startingCursor: Cursor
}

export default class CursorRetriever<T extends any[]> extends Retriever<T> {
    constructor(config:Config<T>) {
        super(config)
        this.getter = config.getter
        this.nextCursor = config.startingCursor
    }

    protected nextCursor?:Cursor
    protected pastCursors:Cursor[] = []
    protected pending?:Promise<void>
    protected getter: (cursor:Cursor) => Promise<Response<T>>

    get() {
        if (this.pending) {
            return
        } 
        
        if (this.nextCursor) {
            this.pending = Promise.all([
                ...this.pastCursors.map(this.getter),
                this.getter(this.nextCursor).then(response => {
                    if (!this.nextCursor) throw new Error('nextCursor should not be null, because we just retrieved it')
                    this.pastCursors = [...this.pastCursors, this.nextCursor]
                    this.nextCursor = response.cursor
                    return response
                })
            ])
            .then(
                responses => {
                    const results:any[] = responses.reduce<any[]>((acc, {results})=>(
                        [...acc, ...results]
                    ), [])
                    this.pending = undefined
                    this.onData(<T>results)
                },
                (err) => {
                    this.pending = undefined
                    this.onError(err)
                }
            )
        }
    }

    destroy(){
        this.pending = undefined
        this.pastCursors = []
    }

}