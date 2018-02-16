import Retriever, {Config as BaseConfig} from './Retriever'
import Cursor from './Cursor'
import Response from './Response'

interface Config<T> extends BaseConfig<T[]> {
    getter(cursor:Cursor):Promise<Response<T>>
    startingCursor: Cursor
}

export default class CursorRetriever<T> extends Retriever<T[]> {
    constructor(config:Config<T>) {
        super(config)
        this.getter = config.getter
        this.nextCursor = config.startingCursor
    }

    protected nextCursor?:Cursor
    protected pastCursors:Cursor[] = []
    protected pending?:Promise<T[]>
    protected getter: (cursor:Cursor) => Promise<Response<T>>

    async get():Promise<T[]> {
        if (this.pending) {
            return this.pending
        } 
        
        if (this.nextCursor) {
            this.pending = Promise.all([
                ...this.pastCursors.map(this.getter),
                this.getter(this.nextCursor).then(result => {
                    this.pastCursors = [...this.pastCursors, this.nextCursor!]
                    this.nextCursor = result.cursor
                    this.pending = undefined
                    return result
                })
            ])
            .then(
                responses => {
                    const results = responses.reduce<T[]>((acc, {results})=>(
                        [...acc, ...results]
                    ), [])
                    this.onData(results)
                    return results
                },
                (err) => {
                    this.pending = undefined
                    throw err
                }
            )
            return this.pending
        } else {
            return []
        }
    }

    destroy(){
        this.pending = undefined
    }

}