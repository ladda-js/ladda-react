import * as React from 'react'
import Observable from '../../retrievers/Observable';
import Retriever from '../../retrievers/Retriever';
import ResolveRetriever from '../../retrievers/ResolveRetriever';
import ObservableRetriever from '../../retrievers/ObserveRetriever';
import PollRetriever from '../../retrievers/PollRetriever';
import Page from '../../retrievers/Page';
import Cursor from '../../retrievers/Cursor';
import PaginatedRetriever from '../../retrievers/PaginatedRetriever';
import PaginatedObserveRetriever from '../../retrievers/PaginatedObserverRetriever';
import CursorRetriever from '../../retrievers/CursorRetriever';
import Response from '../../retrievers/Response'

type InjectedResults<TypeMap> = {[key in keyof TypeMap]:TypeMap[key]}

interface ResolveConfig<T> {
    resolve: () => Promise<T>
}

interface ObserveConfig<T> {
    observe: () => Observable<T>
}

interface PollConfig<T> {
    poll: () => Promise<T>
    interval: number
}

interface ResolvePageConfig<T> {
    resolvePage: (page: Page) => Promise<T>
    getNextPage: (page?: Page) => Page
}

interface ObservePageConfig<T> {
    observePage: (page: Page) => Observable<T>
    getNextPage: (page?: Page) => Page
}

interface CursorConfig<T> {
    resolveCursor: (cursor: Cursor) => Promise<Response<T>>
    startingCursor: Cursor
}

type Config<T> = ResolveConfig<T>
               | ObserveConfig<T>
               | PollConfig<T>
               | ResolvePageConfig<T>
               | ObservePageConfig<T>
               | CursorConfig<T>

type ConfigMap<TypeMap> = {
    [name in keyof TypeMap]: Config<TypeMap[name]>
}

interface Props<TypeMap> {
    children: (props:State<TypeMap>) => JSX.Element
    config: ConfigMap<TypeMap>
}

interface State<TypeMap> {
    resolvedProps: Partial<TypeMap>
    pending: boolean
    error?: Error|null
}

export default class Loader<TypeMap> extends React.PureComponent<Props<TypeMap>, State<TypeMap>> {
    private retrievers:{[key in keyof TypeMap]?: Retriever<TypeMap[key]>} = {}
    state:State<TypeMap> = {
        resolvedProps: {},
        pending: true
    }

    render() {
        return this.props.children(this.state);
    }

    private setupRetrievers(props:Props<TypeMap>) {
        for (const key in props.config) {
            type T = TypeMap[typeof key]
            const config:Config<T> = props.config[key]
            const onData = (data:T) => this.addResolvedData(key, data)
            const onError = (err:Error) => this.setError(key, err)

            if ('resolve' in config) {
                this.retrievers[key] = new ResolveRetriever<T>({
                    getter: config.resolve,
                    onData,
                    onError
                })
            } else if ('observe' in config) {
                this.retrievers[key] = new ObservableRetriever<T>({
                    getter: config.observe,
                    onData,
                    onError
                })
            } else if ('poll' in config) {
                this.retrievers[key] = new PollRetriever<T>({
                    getter: config.poll,
                    interval: config.interval,
                    onData,
                    onError
                })
            } else if ('resolvePage' in config) {
                // Impossible to prove that T is an array
                this.retrievers[key] = new PaginatedRetriever<any>({
                    getter: config.resolvePage,
                    getNextPage: config.getNextPage,
                    onData, 
                    onError
                })
            } else if ('observePage' in config) {
                // Impossible to prove that T is an array
                this.retrievers[key] = new PaginatedObserveRetriever<any>({
                    getter: config.observePage,
                    getNextPage: config.getNextPage,
                    onData,
                    onError
                })
            } else if ('resolveCursor' in config) {
                // Impossible to prove that T is an array
                this.retrievers[key] = new CursorRetriever<any>({
                    getter: config.resolveCursor,
                    startingCursor: config.startingCursor,
                    onData,
                    onError
                })
            } else {
                throw new Error('Unknown config for '+key)
            }
        }
    }

    private addResolvedData(key:keyof TypeMap, data:TypeMap[typeof key]) {
        this.setState((state:State<TypeMap>) => {
            // TODO Track if all datasources have data and only then set pending to false
            return {
                pending: false,
                error: null,
                resolvedProps: {...state.resolvedProps as any, [key]: data}
            }
        })
    }

    private setError(key:keyof TypeMap, error:Error) {
        this.setState({pending: false, error})
    }

    private destroy() {
        for (const key in this.retrievers) {
            type T = TypeMap[typeof key]
            const retriever:Retriever<T>|undefined = this.retrievers[key]
            if (!retriever) throw new Error('Undefined retriever: '+key) // Should not be possible
            retriever.destroy()
            this.retrievers[key] = undefined
        }
    }

    trigger() {
        this.setState({ pending: true, error: null });
        for (const key in this.retrievers) {
            type T = TypeMap[typeof key]
            const retriever:Retriever<T>|undefined = this.retrievers[key]
            if (!retriever) throw new Error('Undefined retriever: '+key) // Should not be possible
            retriever.get()
        }
    }

}