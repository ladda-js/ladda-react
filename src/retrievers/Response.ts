import Cursor from './Cursor'

export default interface Response<T> {
  results: T
  cursor?:Cursor
}
