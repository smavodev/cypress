<template>
  <SettingsSection
    data-cy="settings-experiments"
  >
    <template #title>
      {{ t('settingsPage.experiments.title') }}
    </template>
    <template #description>
      <i18n-t
        scope="global"
        keypath="settingsPage.experiments.description"
      >
        <ExternalLink
          href="https://on.cypress.io/experiments"
        >
          {{ t('links.learnMore') }}
        </ExternalLink>
      </i18n-t>
    </template>
    <div
      class="border rounded mx-auto border-gray-100 grid px-[24px] gap-0 align-center first:border-t-0"
    >
      <ExperimentRow
        v-for="experiment in localExperiments"
        :key="experiment.key"
        :data-cy="`experiment-${experiment.key}`"
        class="border-t border-gray-100 py-[24px] first:border-0"
        :experiment="experiment"
      />
    </div>
  </SettingsSection>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { gql } from '@urql/vue'
import ExperimentRow from './ExperimentRow.vue'
import SettingsSection from '../SettingsSection.vue'
import ExternalLink from '@cy/gql-components/ExternalLink.vue'
import type { ExperimentsFragment } from '../../generated/graphql'
import { useI18n } from '@cy/i18n'
import type { CypressResolvedConfig } from './projectSettings'
const { t } = useI18n()

gql`
fragment Experiments on CurrentProject {
  id
  config
}
`

const props = defineProps<{
  gql?: ExperimentsFragment | null
}>()

const localExperiments = computed(() => {
  return props.gql?.config ? (props.gql.config as CypressResolvedConfig).filter((item) => item.field.startsWith('experimental')).map((configItem) => {
    return {
      key: configItem.field,
      name: t(`settingsPage.experiments.${configItem.field}.name`),
      enabled: !!configItem.value,
      description: t(`settingsPage.experiments.${configItem.field}.description`),
    }
  }) : []
})
</script>
