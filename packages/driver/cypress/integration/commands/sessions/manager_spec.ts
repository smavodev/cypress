const SessionsManager = require('@packages/driver/src/cy/commands/sessions/manager').default

describe('src/cy/commands/sessions/manager.ts', () => {
  // @ts-ignore
  const CypressInstance = Cypress.$Cypress.create({})
  const baseUrl = Cypress.config('baseUrl')

  it('creates SessionsManager instance', () => {
    const sessions = new SessionsManager(CypressInstance, () => {})

    expect(sessions).to.haveOwnProperty('cy')
    expect(sessions).to.haveOwnProperty('Cypress')
    expect(sessions).to.haveOwnProperty('currentTestRegisteredSessions')
    expect(sessions.currentTestRegisteredSessions).to.be.instanceOf(Map)
  })

  describe('.setActiveSession()', () => {
    it('adds session when non were previously added', () => {
      const cySpy = cy.spy(cy, 'state').withArgs('activeSessions')

      const activeSession: Cypress.Commands.Session.ActiveSessions = {
        'session_1': {
          id: 'session_1',
          setup: () => {},
          hydrated: true,
        },
      }

      const sessions = new SessionsManager(CypressInstance, cy)

      sessions.setActiveSession(activeSession)
      const calls = cySpy.getCalls()

      expect(cySpy).to.be.calledTwice
      expect(calls[0].args[1]).to.be.undefined
      expect(calls[1].args[1]).to.haveOwnProperty('session_1')
    })

    it('adds session when other sessions had previously added', () => {
      const existingSessions: Cypress.Commands.Session.ActiveSessions = {
        'session_1': {
          id: 'session_1',
          setup: () => {},
          hydrated: false,
        },
        'session_2': {
          id: 'session_2',
          setup: () => {},
          hydrated: true,
        },
      }

      const cySpy = cy.stub(cy, 'state').callThrough().withArgs('activeSessions').returns(existingSessions)

      const activeSession: Cypress.Commands.Session.ActiveSessions = {
        'session_3': {
          id: 'session_3',
          setup: () => {},
          hydrated: true,
        },
      }

      const sessions = new SessionsManager(CypressInstance, cy)

      sessions.setActiveSession(activeSession)
      const calls = cySpy.getCalls()

      expect(cySpy).to.be.calledTwice
      expect(calls[0].args[1]).to.be.undefined
      expect(calls[1].args[1]).to.haveOwnProperty('session_1')
      expect(calls[1].args[1]).to.haveOwnProperty('session_2')
      expect(calls[1].args[1]).to.haveOwnProperty('session_3')
    })
  })

  describe('.getActiveSession()', () => {
    it('returns undefined when no active sessions', () => {
      const cySpy = cy.stub(cy, 'state').callThrough().withArgs('activeSessions')

      const sessions = new SessionsManager(CypressInstance, cy)

      const activeSession = sessions.getActiveSession('session_1')

      expect(cySpy).to.be.calledOnce
      expect(activeSession).to.be.undefined
    })

    it('returns session when found', () => {
      const activeSessions: Cypress.Commands.Session.ActiveSessions = {
        'session_1': {
          id: 'session_1',
          setup: () => {},
          hydrated: false,
        },
        'session_2': {
          id: 'session_2',
          setup: () => {},
          hydrated: true,
        },
      }

      const cySpy = cy.stub(cy, 'state').callThrough().withArgs('activeSessions').returns(activeSessions)

      const sessions = new SessionsManager(CypressInstance, cy)

      let activeSession = sessions.getActiveSession('session_1')

      expect(cySpy).to.be.calledOnce
      expect(activeSession).to.deep.eq(activeSessions['session_1'])
    })
  })

  describe('.clearActiveSessions()', () => {
    it('handles when no active sessions have been set', () => {
      const cySpy = cy.stub(cy, 'state').callThrough().withArgs('activeSessions')

      const sessions = new SessionsManager(CypressInstance, cy)

      sessions.clearActiveSessions()
      const calls = cySpy.getCalls()

      expect(cySpy).to.be.calledTwice
      expect(calls[1].args[1]).to.be.instanceOf(Object)
      expect(calls[1].args[1]).to.deep.eq({})
    })

    it('updates the existing active sessions to "hydrated: false"', () => {
      const existingSessions: Cypress.Commands.Session.ActiveSessions = {
        'session_1': {
          id: 'session_1',
          setup: () => {},
          hydrated: false,
        },
        'session_2': {
          id: 'session_2',
          setup: () => {},
          hydrated: true,
        },
      }

      const cySpy = cy.stub(cy, 'state').callThrough().withArgs('activeSessions').returns(existingSessions)

      const sessions = new SessionsManager(CypressInstance, cy)

      sessions.clearActiveSessions()
      const calls = cySpy.getCalls()

      expect(cySpy).to.be.calledTwice
      expect(calls[1].args[1]).to.be.instanceOf(Object)
      expect(calls[1].args[1]).to.haveOwnProperty('session_1')
      expect(calls[1].args[1].session_1).to.haveOwnProperty('hydrated', false)
      expect(calls[1].args[1]).to.haveOwnProperty('session_2')
      expect(calls[1].args[1].session_2).to.haveOwnProperty('hydrated', false)
    })
  })

  describe('.mapOrigins()', () => {
    it('maps when requesting all origins', async () => {
      const sessions = new SessionsManager(CypressInstance, cy)

      const allOrigins = ['https://example.com', baseUrl, 'http://foobar.com', 'http://foobar.com']
      const sessionsSpy = cy.stub(sessions, 'getAllHtmlOrigins').resolves(allOrigins)

      const origins = await sessions.mapOrigins('*')

      expect(origins).to.deep.eq(['https://example.com', baseUrl, 'http://foobar.com'])
      expect(sessionsSpy).to.be.calledOnce
    })

    it('maps when requesting the current origin', async () => {
      const sessions = new SessionsManager(CypressInstance, cy)
      const sessionsSpy = cy.stub(sessions, 'getAllHtmlOrigins')
      const origins = await sessions.mapOrigins('currentOrigin')

      expect(origins).to.deep.eq([baseUrl])
      expect(sessionsSpy).not.to.be.called
    })

    it('maps when requesting a specific origin', async () => {
      const sessions = new SessionsManager(CypressInstance, cy)
      const sessionsSpy = cy.stub(sessions, 'getAllHtmlOrigins')
      const origins = await sessions.mapOrigins('https://example.com/random_page?1')

      expect(origins).to.deep.eq(['https://example.com'])
      expect(sessionsSpy).not.to.be.called
    })
  })

  describe('._setStorageOnOrigins()', () => {})

  it('.getAllHtmlOrigins()', async () => {
    const storedOrigins = {
      'https://example.com': {},
      'https://foobar.com': {},
    }

    storedOrigins[`${baseUrl}`] = {}
    const cypressSpy = cy.stub(CypressInstance, 'backend').callThrough().withArgs('get:rendered:html:origins').resolves(storedOrigins)
    const sessions = new SessionsManager(CypressInstance, cy)

    const origins = await sessions.getAllHtmlOrigins()

    expect(cypressSpy).have.been.calledOnce
    expect(origins).to.have.lengthOf(3)
    expect(origins).to.deep.eq(['https://example.com', 'https://foobar.com', baseUrl])
  })

  it('.defineSession()', () => {
    const sessions = new SessionsManager(CypressInstance, cy)
    const sessionsSpy = cy.stub(sessions, 'setActiveSession')
    const setup = cy.stub()
    const sess = sessions.defineSession({ id: '1', setup })

    expect(sess).to.deep.eq({
      id: '1',
      setup,
      validate: undefined,
      cookies: null,
      localStorage: null,
      hydrated: false,
    })

    expect(sessionsSpy).to.be.calledOnce
    expect(sessionsSpy.getCall(0).args[0]).to.deep.eq({ 1: sess })
  })

  it('.clearAllSavedSessions()', async () => {
    const cypressSpy = cy.stub(CypressInstance, 'backend').withArgs('clear:session').resolves(null)

    const sessions = new SessionsManager(CypressInstance, () => {})
    const sessionsSpy = cy.stub(sessions, 'clearActiveSessions')

    await sessions.clearAllSavedSessions()

    expect(sessionsSpy).to.be.calledOnce
    expect(cypressSpy).to.be.calledOnceWith('clear:session', null)
  })

  it('.clearCurrentSessionData()', async () => {
    const windowLocalStorageStub = cy.stub(window.localStorage, 'clear')
    const windowSessionStorageStub = cy.stub(window.sessionStorage, 'clear')

    const sessions = new SessionsManager(CypressInstance, () => {})
    const clearStorageSpy = cy.stub(sessions, 'clearStorage')
    const clearCookiesSpy = cy.stub(sessions, 'clearCookies')

    await sessions.clearCurrentSessionData()
    expect(clearStorageSpy).to.be.calledOnce
    expect(clearCookiesSpy).to.be.calledOnce
    expect(windowLocalStorageStub).to.be.calledOnce
    expect(windowSessionStorageStub).to.be.calledOnce
  })

  // TODO
  describe('.setSessionData', () => {})

  it('.getCookies()', async () => {
    const cookies = [{ id: 'cookie' }]
    const cypressSpy = cy.stub(CypressInstance, 'automation').withArgs('get:cookies').resolves(cookies)

    const sessions = new SessionsManager(CypressInstance, () => {})

    const sessionCookies = await sessions.getCookies()

    expect(cypressSpy).to.be.calledOnceWith('get:cookies', {})
    expect(sessionCookies).to.deep.eq(cookies)
  })

  it('.setCookies()', async () => {
    const cypressSpy = cy.stub(CypressInstance, 'automation').withArgs('set:cookies')

    const sessions = new SessionsManager(CypressInstance, () => {})

    await sessions.setCookies({})

    expect(cypressSpy).to.be.calledOnceWith('set:cookies', {})
  })

  it('.clearCookies()', async () => {
    const cookies = [{ id: 'cookie' }]
    const cypressSpy = cy.stub(CypressInstance, 'automation').withArgs('clear:cookies').resolves([])

    const sessions = new SessionsManager(CypressInstance, () => {})
    const sessionsSpy = cy.stub(sessions, 'getCookies').resolves(cookies)

    await sessions.clearCookies()

    expect(sessionsSpy).to.be.calledOnce
    expect(cypressSpy).to.be.calledOnceWith('clear:cookies', cookies)
  })

  it('.getCurrentSessionData', async () => {
    const sessions = new SessionsManager(CypressInstance, () => {})
    const getStorageSpy = cy.stub(sessions, 'getStorage').resolves({ localStorage: [] })
    const cookiesSpy = cy.stub(sessions, 'getCookies').resolves([{ id: 'cookie' }])

    const sessData = await sessions.getCurrentSessionData()

    expect(sessData).to.deep.eq({
      localStorage: [],
      cookies: [{ id: 'cookie' }],
    })

    expect(getStorageSpy).to.be.calledOnce
    expect(cookiesSpy).to.be.calledOnce
  })

  it('.getSession()', () => {
    const cypressSpy = cy.stub(CypressInstance, 'backend').callThrough().withArgs('get:session')

    const sessions = new SessionsManager(CypressInstance, () => {})

    sessions.getSession('session_1')

    expect(cypressSpy).to.be.calledOnceWith('get:session', 'session_1')
  })

  // TODO
  describe('.getStorage', () => {})

  // TODO
  describe('.clearStorage', () => {})

  // TODO
  describe('.setStorage', () => {})
})