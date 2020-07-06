import { observer } from 'mobx-react'
import React, { Component, createRef, RefObject } from 'react'
// @ts-ignore
import Tooltip from '@cypress/react-tooltip'

import events, { Events } from '../lib/events'
import appState, { AppState } from '../lib/app-state'
import Collapsible from '../collapsible/collapsible'
import { indent } from '../lib/util'
import runnablesStore, { RunnablesStore } from '../runnables/runnables-store'
import TestModel from './test-model'
import scroller, { Scroller } from '../lib/scroller'

import Attempts from '../attempts/attempts'

interface Props {
  events: Events
  appState: AppState
  runnablesStore: RunnablesStore
  scroller: Scroller
  model: TestModel
}

@observer
class Test extends Component<Props> {
  static defaultProps = {
    events,
    appState,
    runnablesStore,
    scroller,
  }

  containerRef: RefObject<HTMLDivElement>

  constructor (props: Props) {
    super(props)

    this.containerRef = createRef<HTMLDivElement>()
  }

  componentDidMount () {
    this._scrollIntoView()
  }

  componentDidUpdate () {
    this._scrollIntoView()
    this.props.model.callbackAfterUpdate()
  }

  _scrollIntoView () {
    const { appState, model, scroller } = this.props
    const { state, shouldRender } = model

    if (appState.autoScrollingEnabled && appState.isRunning && shouldRender && state !== 'processing') {
      window.requestAnimationFrame(() => {
        scroller.scrollIntoView(this.containerRef.current as HTMLElement)
      })
    }
  }

  render () {
    const { model } = this.props

    if (!model.shouldRender) return null

    return (
      <Collapsible
        containerRef={this.containerRef}
        header={this._header()}
        headerClass='runnable-wrapper'
        headerStyle={{ paddingLeft: indent(model.level) }}
        contentClass='runnable-instruments'
        isOpen={model.isOpen}
        toggleOpen={model.toggleOpen}
      >
        {this._contents()}
      </Collapsible>
    )
  }

  _header () {
    const { model } = this.props

    return (<>
      <i aria-hidden='true' className='runnable-state fas' />
      <span className='runnable-title'>
        <span>{model.title}</span>
        <span className='visually-hidden'>{model.state}</span>
      </span>
      <span className='runnable-controls'>
        <Tooltip placement='top' title='One or more commands failed' className='cy-tooltip'>
          <i className='fas fa-exclamation-triangle' />
        </Tooltip>
      </span>
    </>)
  }

  _contents (this: Test) {
    // performance optimization - don't render contents if not open
    if (!this.props.model.isOpen) return null

    return (
      <div
        className='runnable-instruments collapsible-content'
        onClick={(e) => e.stopPropagation()}
      >
        <Attempts test={this.props.model} scrollIntoView={() => this._scrollIntoView()} />
      </div>
    )
  }

  _onErrorClick = (e:Event) => {
    e.stopPropagation()
    this.props.events.emit('show:error', this.props.model)
  }
}

export default Test
