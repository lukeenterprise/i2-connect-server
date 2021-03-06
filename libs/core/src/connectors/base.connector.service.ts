import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConnectorConfigService } from '../config/config.service';
import { IConnectorConfig } from '../config/marshalers/ConnectorConfigMarshaler';
import { IConnectorConfigDto } from '../config/dto/ConnectorConfigDto';
import { IConnectorManifest } from '../manifest/marshalers/ConnectorManifestMarshaler';
import { ConnectorManifestService } from '../manifest/manifest.service';
import { ConnectorSchemaService } from '../schema/schema.service';
import { ConnectorChartingSchemesService } from '../chartingSchemes/chartingSchemes.service';
import { IBaseConnectorService } from './interfaces/IBaseConnectorService';
import { IConnectorSchemaItem } from '../schema/interfaces/ISchemaItem';
import { IConnectorChartingSchemesItem } from '../chartingSchemes/interfaces/IChartingSchemeItem';
import { IConnectorTypeMapItem } from '../typemap/interfaces/ITypeMapItem';
import { DEFAULT_SITE_ID } from '../constants';
import { ConnectorTypeMapService } from '../typemap/typemap.service';
import { ITypeMap } from '../typemap/marshalers/TypeMapMarshaler';
import { IConnectorTransformItem } from '../transforms/interfaces/ITransformItem';
import { ConnectorTransformService } from '../transforms/transform.service';
import { UtilSettings, ISettingsItemData } from '../util/settings';
import { ConnectorEnvironmentService } from '../settings/connector/connector.env.service';
import { IReloadCacheResponseDto, IServiceRequestQuery } from '../service';

@Injectable({ scope: Scope.TRANSIENT })
export class BaseConnectorService implements IBaseConnectorService {

    private _connectorId: string;
    private _connectorManifest: IConnectorManifest;
    private _connectorConfig: IConnectorConfig;
    private _connectorSchemaItems: IConnectorSchemaItem[];
    private _connectorChartingSchemesItems: IConnectorChartingSchemesItem[];
    private _connectorTypeMapItems: IConnectorTypeMapItem[];
    private _connectorTransformItems: IConnectorTransformItem[];

    constructor(private _connSettings: ConnectorEnvironmentService,
                private _configService: ConnectorConfigService,
                private _schemaService: ConnectorSchemaService,
                private _chartingSchemesService: ConnectorChartingSchemesService,
                private _typeMapService: ConnectorTypeMapService,
                private _transformService: ConnectorTransformService) {}

    public async initializeAsync(connectorManifest: IConnectorManifest): Promise<void> {
        Logger.log(`Initializing provider for connector '${connectorManifest.name}'`, 'ConnectorService');

        this._connectorManifest = connectorManifest;
        this._connectorId = connectorManifest.id;

        await this.loadConnectorCachesAsync();
    }
    
    public get connectorId() {
        return this._connectorId;
    }

    public get connectorName() {
        return this._connectorManifest.name;
    }

    public getConnectorConfigAsDto(query: IServiceRequestQuery): IConnectorConfigDto {
        query.siteid = query.siteid || DEFAULT_SITE_ID;
        if (this._connectorConfig) {
            try {
                // modify the connector config for the specific site (updating associated type ids and urls)
                const typeMap = this.getTypeMap(query.siteid);
                const siteSpecificConfig = ConnectorConfigService.getMappedConfig(this._connectorConfig, typeMap, query);
                return ConnectorConfigService.getConnectorConfigAsDto(siteSpecificConfig);
            } catch (err) {
                throw Error(`Problem returning config for connector '${this._connectorId}'. ${err.message}`)
            }
        } else {
            throw Error(`Connector '${this._connectorId}' does not have a config defined.`)
        }
    }

    public getConnectorSchemaAsDto(query: IServiceRequestQuery): string {
        query.siteid = query.siteid || DEFAULT_SITE_ID;
        // find the correct schema
        const schemaItem = ConnectorSchemaService.findConnectorSchemaItem(this._connectorSchemaItems, query.siteid);
        if (schemaItem) {
            try {
                return ConnectorSchemaService.getConnectorSchemaAsDto(schemaItem);
            } catch (err) {
                throw Error(`Problem returning schema for connector '${this._connectorId}'. ${err.message}`)
            }
        } else {
            throw Error(`Connector '${this._connectorId}' does not have a schema defined for site id '${query.siteid}'.`)
        }
    }

    public getConnectorChartingSchemesAsDto(query: IServiceRequestQuery): string {
        query.siteid = query.siteid || DEFAULT_SITE_ID;
        // find the correct charting scheme
        const chartingSchemesItem = ConnectorChartingSchemesService.findConnectorChartingSchemesItem(this._connectorChartingSchemesItems, query.siteid);
        if (chartingSchemesItem) {
            try {
                return ConnectorChartingSchemesService.getConnectorChartingSchemesAsDto(chartingSchemesItem);
            } catch (err) {
                throw Error(`Problem returning charting schemes for connector '${this._connectorId}'. ${err.message}`)
            }
        } else {
            throw Error(`Connector '${this._connectorId}' does not have charting schemes defined for site id '${query.siteid}'.`)
        }
    }

    public getTypeMap(siteId: string): ITypeMap {
        siteId = siteId || DEFAULT_SITE_ID;
        // find the correct type map
        const typeMapItem = ConnectorTypeMapService.findConnectorTypeMapItem(this._connectorTypeMapItems, siteId);
        if (typeMapItem) {
            try {
                return typeMapItem.typeMap;
            } catch (err) {
                throw Error(`Problem returning type map for connector '${this._connectorId}'. ${err.message}`)
            }
        } else {
            throw Error(`Connector '${this._connectorId}' does not have a type map defined for site id '${siteId}'.`)
        }
    }

    public getTransform(id: string): string {
        // find the correct transform
        const transformItem = ConnectorTransformService.findConnectorTransformItem(this._connectorTransformItems, id);
        if (transformItem) {
            try {
                return transformItem.transform;
            } catch (err) {
                throw Error(`Problem returning transform for connector '${this._connectorId}'. ${err.message}`)
            }
        } else {
            throw Error(`Connector '${this._connectorId}' does not have a transform defined with id '${id}'.`)
        }
    }

    public async getSettingValueAsync(id: string): Promise<ISettingsItemData> {
        try {
            const connectorSetting = ConnectorManifestService.getSetting(this._connectorManifest, id, true);
            const settingsValue = await UtilSettings.getSettingsValue(connectorSetting);
            // assumed that will be getting item data returned
            return settingsValue.value as ISettingsItemData;
        } catch (err) {
            throw Error(`Problem retrieving setting '${id}' for connector '${this._connectorId}'. ${err.message}`)
        }        
    }

    public getSettingLogPayloads(): boolean {
        return this._connSettings.logPayloads;
    }

    public async reloadCachesAsync(): Promise<IReloadCacheResponseDto> {
        await this.loadConnectorCachesAsync();
        return {
            message: 'Connector caches reloaded successfully.'
        }
    }

    private async loadConnectorCachesAsync(): Promise<void> {
        await this.loadConnectorConfigAsync();
        await this.loadConnectorSchemaItemsAsync();
        await this.loadConnectorChartingSchemesItemsAsync();
        await this.loadConnectorTypeMapItemsAsync();
        await this.loadConnectorTransformItemsAsync();
    }

    private async loadConnectorConfigAsync(): Promise<void> {
        try {
            this._connectorConfig = null; // clear existing cache
            const configSetting = ConnectorManifestService.getConnectorConfigSetting(this._connectorManifest, true);
            this._connectorConfig = await this._configService.getConnectorConfig(configSetting);
        } catch (err) {
            throw Error(`Problem loading config for connector '${this._connectorId}'. ${err.message}`)
        }
    }

    private async loadConnectorSchemaItemsAsync(): Promise<void> {
        try {
            this._connectorSchemaItems = null; // clear existing cache
            const schemasSetting = ConnectorManifestService.getConnectorSchemasSetting(this._connectorManifest, false);
            if (schemasSetting) {
                this._connectorSchemaItems = await this._schemaService.getConnectorSchemaItems(schemasSetting);
            }
        } catch (err) {
            throw Error(`Problem loading schema for connector '${this._connectorId}'. ${err.message}`)
        }
    }

    private async loadConnectorChartingSchemesItemsAsync(): Promise<void> {
        try {
            this._connectorChartingSchemesItems = null; // clear existing cache
            const chartingSchemesSetting = ConnectorManifestService.getConnectorChartingSchemesSetting(this._connectorManifest, false);
            if (chartingSchemesSetting) {
                this._connectorChartingSchemesItems = await this._chartingSchemesService.getConnectorChartingSchemesItems(chartingSchemesSetting);
            }
        } catch (err) {
            throw Error(`Problem loading charting schemes for connector '${this._connectorId}'. ${err.message}`)
        }
    }    

    private async loadConnectorTypeMapItemsAsync(): Promise<void> {
        try {
            this._connectorTypeMapItems = null; // clear existing cache
            const typeMapsSetting = ConnectorManifestService.getConnectorTypeMapsSetting(this._connectorManifest, false);
            if (typeMapsSetting) {
                this._connectorTypeMapItems = await this._typeMapService.getConnectorTypeMapItems(typeMapsSetting);
            }
        } catch (err) {
            throw Error(`Problem loading type maps for connector '${this._connectorId}'. ${err.message}`)
        }
    }   

    private async loadConnectorTransformItemsAsync(): Promise<void> {
        try {
            this._connectorTransformItems = null; // clear existing cache
            const transformsSetting = ConnectorManifestService.getConnectorTransformsSetting(this._connectorManifest, false);
            if (transformsSetting) {
                this._connectorTransformItems = await this._transformService.getConnectorTransformItems(transformsSetting);
            }
        } catch (err) {
            throw Error(`Problem loading transforms for connector '${this._connectorId}'. ${err.message}`)
        }
    }   

}