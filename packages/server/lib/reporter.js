const _ = require('lodash')
const path = require('path')
const { stackUtils } = require('@packages/errors')
// mocha-* is used to allow us to have later versions of mocha specified in devDependencies
// and prevents accidentally upgrading this one
// TODO: look into upgrading this to version in driver
const Mocha = require('mocha-7.0.1')
const mochaReporters = require('mocha-7.0.1/lib/reporters')
const mochaCreateStatsCollector = require('mocha-7.0.1/lib/stats-collector')
const mochaColor = mochaReporters.Base.color
const mochaSymbols = mochaReporters.Base.symbols

const debug = require('debug')('cypress:server:reporter')
const Promise = require('bluebird')
const { overrideRequire } = require('./override_require')

// override calls to `require('mocha*')` when to always resolve with a mocha we control
// otherwise mocha will be resolved from project's node_modules and might not work with our code
const customReporterMochaPath = path.dirname(require.resolve('mocha-7.0.1'))

overrideRequire((depPath, _load) => {
  if ((depPath === 'mocha') || depPath.startsWith('mocha/')) {
    return _load(depPath.replace('mocha', customReporterMochaPath))
  }
})

// if Mocha.Suite.prototype.titlePath
//   throw new Error('Mocha.Suite.prototype.titlePath already exists. Please remove the monkeypatch code.')

// Mocha.Suite.prototype.titlePath = ->
//   result = []

//   if @parent
//     result = result.concat(@parent.titlePath())

//   if !@root
//     result.push(@title)

//   return result

// Mocha.Runnable.prototype.titlePath = ->
//   @parent.titlePath().concat([@title])

const getTitlePath = function (runnable, titles = []) {
  // `originalTitle` is a Mocha Hook concept used to associated the
  // hook to the test that executed it
  if (runnable.originalTitle) {
    runnable.title = runnable.originalTitle
  }

  if (runnable.title) {
    // sanitize the title which may have been altered by a suite-/
    // test-level browser skip to ensure the original title is used
    const BROWSER_SKIP_TITLE = ' (skipped due to browser)'

    titles.unshift(runnable.title.replace(BROWSER_SKIP_TITLE, ''))
  }

  if (runnable.parent) {
    return getTitlePath(runnable.parent, titles)
  }

  return titles
}

const createSuite = function (obj, parent) {
  const suite = new Mocha.Suite(obj.title, {})

  if (parent) {
    suite.parent = parent
  }

  suite.file = obj.file
  suite.root = !!obj.root

  return suite
}

const createRunnable = function (obj, parent) {
  let fn
  const { body } = obj

  if (body) {
    fn = function () {}
    fn.toString = () => {
      return body
    }
  }

  const runnable = new Mocha.Test(obj.title, fn)

  runnable.timedOut = obj.timedOut
  runnable.async = obj.async
  runnable.sync = obj.sync
  runnable.duration = obj.duration
  runnable.state = obj.state != null ? obj.state : 'skipped' // skipped by default
  runnable._retries = obj._retries
  // shouldn't need to set _currentRetry, but we'll do it anyways
  runnable._currentRetry = obj._currentRetry

  if (runnable.body == null) {
    runnable.body = body
  }

  if (parent) {
    runnable.parent = parent
  }

  return runnable
}

const mochaProps = {
  'currentRetry': '_currentRetry',
  'retries': '_retries',
}

const toMochaProps = (testProps) => {
  return _.each(mochaProps, (val, key) => {
    if (testProps.hasOwnProperty(key)) {
      testProps[val] = testProps[key]

      return delete testProps[key]
    }
  })
}

const toAttemptProps = (runnable) => {
  return _.pick(runnable, [
    'err',
    'state',
    'timings',
    'failedFromHookId',
    'wallClockStartedAt',
    'wallClockDuration',
  ])
}

const mergeRunnable = (eventName) => {
  return (function (testProps, runnables) {
    toMochaProps(testProps)

    const runnable = runnables[testProps.id]

    if (eventName === 'test:before:run') {
      if (testProps._currentRetry > runnable._currentRetry) {
        debug('test retried:', testProps.title)
        const prevAttempts = runnable.prevAttempts || []

        delete runnable.prevAttempts
        const prevAttempt = toAttemptProps(runnable)

        delete runnable.failedFromHookId
        delete runnable.err
        delete runnable.hookName
        testProps.prevAttempts = prevAttempts.concat([prevAttempt])
      }
    }

    return [_.extend(runnable, testProps)]
  })
}

const safelyMergeRunnable = function (hookProps, runnables) {
  const { hookId, title, hookName, body, type } = hookProps

  if (!runnables[hookId]) {
    runnables[hookId] = {
      hookId,
      type,
      title,
      body,
      hookName,
    }
  }

  return [_.extend({}, runnables[hookProps.id], hookProps)]
}

const mergeErr = function (runnable, runnables, stats) {
  // this will always be a test because
  // we reset hook id's to match tests
  let test = runnables[runnable.id]

  test.err = runnable.err
  test.state = 'failed'

  if (runnable.type === 'hook') {
    test.failedFromHookId = runnable.hookId
  }

  // dont mutate the test, and merge in the runnable title
  // in the case its a hook so that we emit the right 'fail'
  // event for reporters
  test = _.extend({}, test, { title: runnable.title })

  return [test, test.err]
}

const setDate = function (obj, runnables, stats) {
  let e; let s

  s = obj.start

  if (s) {
    stats.wallClockStartedAt = new Date(s)
  }

  e = obj.end

  if (e) {
    stats.wallClockEndedAt = new Date(e)
  }

  return []
}

const orNull = function (prop) {
  if (prop == null) return null

  return prop
}

const events = {
  'start': setDate,
  'end': setDate,
  'suite': mergeRunnable('suite'),
  'suite end': mergeRunnable('suite end'),
  'test': mergeRunnable('test'),
  'test end': mergeRunnable('test end'),
  'hook': safelyMergeRunnable,
  'retry': true,
  'hook end': safelyMergeRunnable,
  'pass': mergeRunnable('pass'),
  'pending': mergeRunnable('pending'),
  'fail': mergeErr,
  'test:after:run': mergeRunnable('test:after:run'), // our own custom event
  'test:before:run': mergeRunnable('test:before:run'), // our own custom event
}

class Reporter {
  constructor (reporterName = 'spec', reporterOptions = {}, projectRoot) {
    if (!(this instanceof Reporter)) {
      return new Reporter(reporterName)
    }

    this.reporterName = reporterName
    this.projectRoot = projectRoot
    this.reporterOptions = reporterOptions
    this.normalizeTest = this.normalizeTest.bind(this)
  }

  setRunnables (rootRunnable) {
    if (!rootRunnable) {
      rootRunnable = { title: '' }
    }

    // manage stats ourselves
    this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, skipped: 0, failures: 0 }
    this.runnables = {}
    rootRunnable = this._createRunnable(rootRunnable, 'suite')
    const reporter = Reporter.loadReporter(this.reporterName, this.projectRoot)

    this.mocha = new Mocha({ reporter })
    this.mocha.suite = rootRunnable
    this.runner = new Mocha.Runner(rootRunnable)
    mochaCreateStatsCollector(this.runner)

    this.reporter = new this.mocha._reporter(this.runner, {
      reporterOptions: this.reporterOptions,
    })

    if (this.reporterName === 'spec') {
      // Unfortunately the reporter doesn't expose its indentation logic, so we have to replicate it here
      let indents = 0

      this.runner.on('suite', function (suite) {
        ++indents
      })

      this.runner.on('suite end', function () {
        --indents
      })

      // Override the default reporter to always show test timing even for fast tests
      // and display slow ones in yellow rather than red
      this.runner._events.pass[2] = function (test) {
        const durationColor = test.speed === 'slow' ? 'medium' : 'fast'
        const fmt =
          Array(indents).join('  ') +
          mochaColor('checkmark', `  ${ mochaSymbols.ok}`) +
          mochaColor('pass', ' %s') +
          mochaColor(durationColor, ' (%dms)')

        // Log: `✓ test title (300ms)` when a test passes
        // eslint-disable-next-line no-console
        console.log(fmt, test.title, test.duration)
      }
    }

    this.runner.ignoreLeaks = true
  }

  _createRunnable (runnableProps, type, parent) {
    const runnable = (() => {
      switch (type) {
        case 'suite':
          // eslint-disable-next-line no-case-declarations
          const suite = createSuite(runnableProps, parent)

          suite.tests = _.map(runnableProps.tests, (testProps) => {
            return this._createRunnable(testProps, 'test', suite)
          })

          suite.suites = _.map(runnableProps.suites, (suiteProps) => {
            return this._createRunnable(suiteProps, 'suite', suite)
          })

          return suite
        case 'test':
          return createRunnable(runnableProps, parent)
        default:
          throw new Error(`Unknown runnable type: '${type}'`)
      }
    })()

    runnable.id = runnableProps.id

    this.runnables[runnableProps.id] = runnable

    return runnable
  }

  emit (event, arg) {
    if (event === 'retry' && this.reporterName === 'spec') {
      this._logRetry(arg)
    }

    // ignore the event if we haven't accounted for it
    if (!events[event]) return

    const args = this.parseArgs(event, arg)

    return this.runner && this.runner.emit.apply(this.runner, args)
  }

  parseArgs (event, arg) {
    const normalizeArgs = events[event]

    const args = _.isFunction(normalizeArgs)
      ? normalizeArgs.call(this, arg, this.runnables, this.stats)
      : [arg]

    // the normalizeArgs function needs the id property, but we want to remove
    // and other private props before logging/emitting to mocha
    args[0] = _.isPlainObject(args[0]) ? _.omit(args[0], ['id', 'hookId']) : args[0]

    debug('got mocha event \'%s\' with args: %o', event, args)

    return [event].concat(args)
  }

  _logRetry (test) {
    const runnable = this.runnables[test.id]
    const padding = '  '.repeat(runnable.titlePath().length)
    const retryMessage = mochaColor('medium', `(Attempt ${test.currentRetry + 1} of ${test.retries + 1})`)

    // Log: `(Attempt 1 of 2) test title` when a test retries
    // eslint-disable-next-line no-console
    console.log(`${padding}${retryMessage} ${test.title}`)
  }

  normalizeHook (hook = {}) {
    return {
      hookId: hook.hookId,
      hookName: hook.hookName,
      title: getTitlePath(hook),
      body: hook.body,
    }
  }

  normalizeTest (test = {}) {
    const normalizedTest = {
      testId: orNull(test.id),
      title: getTitlePath(test),
      state: orNull(test.state),
      body: orNull(test.body),
      displayError: orNull(test.err && test.err.stack),
      attempts: _.map((test.prevAttempts || []).concat([test]), (attempt) => {
        const err = attempt.err && {
          name: attempt.err.name,
          message: attempt.err.message,
          stack: attempt.err.stack && stackUtils.stackWithoutMessage(attempt.err.stack),
          codeFrame: attempt.err.codeFrame,
        }

        return {
          state: orNull(attempt.state),
          error: orNull(err),
          timings: orNull(attempt.timings),
          failedFromHookId: orNull(attempt.failedFromHookId),
          wallClockStartedAt: orNull(attempt.wallClockStartedAt && new Date(attempt.wallClockStartedAt)),
          wallClockDuration: orNull(attempt.wallClockDuration),
          videoTimestamp: null,
        }
      }),
    }

    return normalizedTest
  }

  end () {
    if (this.reporter.done) {
      const {
        failures,
      } = this.runner

      return new Promise((resolve, reject) => {
        return this.reporter.done(failures, resolve)
      }).then(() => {
        return this.results()
      })
    }

    return this.results()
  }

  results () {
    const tests = _
    .chain(this.runnables)
    .filter({ type: 'test' })
    .map(this.normalizeTest)
    .value()

    const hooks = _
    .chain(this.runnables)
    .filter({ type: 'hook' })
    .map(this.normalizeHook)
    .value()

    const suites = _
    .chain(this.runnables)
    .filter({ root: false }) // don't include root suite
    .value()

    // default to 0
    this.stats.wallClockDuration = 0

    const { wallClockStartedAt, wallClockEndedAt } = this.stats

    if (wallClockStartedAt && wallClockEndedAt) {
      this.stats.wallClockDuration = wallClockEndedAt - wallClockStartedAt
    }

    this.stats.suites = suites.length
    this.stats.tests = tests.length
    this.stats.passes = _.filter(tests, { state: 'passed' }).length
    this.stats.pending = _.filter(tests, { state: 'pending' }).length
    this.stats.skipped = _.filter(tests, { state: 'skipped' }).length
    this.stats.failures = _.filter(tests, { state: 'failed' }).length

    // return an object of results
    return {
      // this is our own stats object
      stats: this.stats,

      reporter: this.reporterName,

      // this comes from the reporter, not us
      reporterStats: this.runner.stats,

      hooks,

      tests,
    }
  }

  static setVideoTimestamp (videoStart, tests = []) {
    return _.map(tests, (test) => {
      // if we have a wallClockStartedAt
      let wcs

      wcs = test.wallClockStartedAt

      if (wcs) {
        test.videoTimestamp = test.wallClockStartedAt - videoStart
      }

      return test
    })
  }

  static create (reporterName, reporterOptions, projectRoot) {
    return new Reporter(reporterName, reporterOptions, projectRoot)
  }

  static loadReporter (reporterName, projectRoot) {
    let p

    debug('trying to load reporter:', reporterName)

    // Explicitly require this here (rather than dynamically) so that it gets included in the v8 snapshot
    if (reporterName === 'teamcity') {
      debug(`${reporterName} is built-in reporter`)

      return require('mocha-teamcity-reporter')
    }

    // Explicitly require this here (rather than dynamically) so that it gets included in the v8 snapshot
    if (reporterName === 'junit') {
      debug(`${reporterName} is built-in reporter`)

      return require('mocha-junit-reporter')
    }

    if (mochaReporters[reporterName]) {
      debug(`${reporterName} is Mocha reporter`)

      return reporterName
    }

    // it's likely a custom reporter
    // that is local (./custom-reporter.js)
    // or one installed by the user through npm
    try {
      p = path.resolve(projectRoot, reporterName)

      // try local
      debug('trying to require local reporter with path:', p)

      // using path.resolve() here so we can just pass an
      // absolute path as the reporterName which avoids
      // joining projectRoot unnecessarily
      return require(p)
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') {
        // bail early if the error wasn't MODULE_NOT_FOUND
        // because that means theres something actually wrong
        // with the found reporter
        throw err
      }

      p = path.resolve(projectRoot, 'node_modules', reporterName)

      // try npm. if this fails, we're out of options, so let it throw
      debug('trying to require local reporter with path:', p)

      return require(p)
    }
  }

  static getSearchPathsForReporter (reporterName, projectRoot) {
    return _.uniq([
      path.resolve(projectRoot, reporterName),
      path.resolve(projectRoot, 'node_modules', reporterName),
    ])
  }
}

module.exports = Reporter
