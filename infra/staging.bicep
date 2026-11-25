targetScope = 'resourceGroup'

@description('PostgreSQL administrator password. Store and reuse the matching Key Vault secret on redeployment.')
@secure()
param postgresAdminPassword string

@description('Session and private identity encryption secret. Never regenerate for an existing database.')
@secure()
param sessionSecret string

var location = resourceGroup().location
var tags = {
  application: 'udc'
  environment: 'staging'
}
var storageName = 'udcstgeus2app01'
var registryName = 'udcstgeus2acr01'
var vaultName = 'udc-stg-eus2-kv01'
var databaseServerName = 'udc-stg-eus2-pg01'
var webName = 'udc-stg-eus2-web01'
var dnsName = 'udc-stg-eus2.postgres.database.azure.com'
var adminName = 'udcpgadmin'
var image = '${registryName}.azurecr.io/udc:unconfigured'

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'udc-stg-eus2-vnet01'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.230.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.230.0.0/24'
          delegations: [
            {
              name: 'postgres'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
      {
        name: 'app-integration'
        properties: {
          addressPrefix: '10.230.1.0/24'
          delegations: [
            {
              name: 'appservice'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
    ]
  }
}

resource dns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: dnsName
  location: 'global'
  tags: tags
}

resource dnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: dns
  name: 'udc-staging'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource privateContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'private'
  properties: {
    publicAccess: 'None'
  }
}

resource publicContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'public'
  properties: {
    publicAccess: 'None'
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
  }
}

resource postgresPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'postgres-admin-password'
  properties: {
    value: postgresAdminPassword
  }
}

resource identitySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: vault
  name: 'session-secret'
  properties: {
    value: sessionSecret
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: databaseServerName
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: adminName
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: '${vnet.id}/subnets/postgres'
      privateDnsZoneArmResourceId: dns.id
      publicNetworkAccess: 'Disabled'
    }
  }
  dependsOn: [
    dnsLink
    postgresPassword
  ]
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'udc_staging'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'udc-stg-eus2-plan01'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'S1'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

var siteConfig = {
  linuxFxVersion: 'DOCKER|${image}'
  ftpsState: 'Disabled'
  minTlsVersion: '1.2'
  scmMinTlsVersion: '1.2'
  ipSecurityRestrictionsDefaultAction: 'Deny'
  scmIpSecurityRestrictionsDefaultAction: 'Deny'
}

resource web 'Microsoft.Web/sites@2023-12-01' = {
  name: webName
  location: location
  tags: tags
  kind: 'app,linux,container'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    enabled: false
    siteConfig: siteConfig
  }
}

resource slot 'Microsoft.Web/sites/slots@2023-12-01' = {
  parent: web
  name: 'staging'
  location: location
  tags: tags
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    enabled: false
    virtualNetworkSubnetId: '${vnet.id}/subnets/app-integration'
    siteConfig: union(siteConfig, {
      acrUseManagedIdentityCreds: true
    })
  }
}

resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, slot.id, 'AcrPull')
  properties: {
    principalId: slot.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, slot.id, 'StorageBlobDataContributor')
  properties: {
    principalId: slot.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

resource blobDelegator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, slot.id, 'StorageBlobDelegator')
  properties: {
    principalId: slot.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'db58b8e5-c6ad-4a2a-8342-4190687cbf4a')
  }
}

resource vaultReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, slot.id, 'KeyVaultSecretsUser')
  properties: {
    principalId: slot.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}
