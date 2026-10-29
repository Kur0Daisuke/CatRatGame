export class Entity{
    static entityList = [];
    static objectList = [];
    static player;

    static appendEntity(type, entity, id) {
        if(type == "entity") Entity.entityList.push({entity, id});
        else if(type == "object") Entity.objectList.push({entity, id});
        else {
            this.player = {entity, id};
        }
    }

    // Helper method to retrieve entities by type and extract their underlying class instances
    static getEntitiesByType(type) {
        if (type === "entity") {
            return Entity.entityList.map(item => item.entity);
        } else if (type === "object") {
            return Entity.objectList.map(item => item.entity);
        }
        return [];
    }

    static removeEntity(entity) {
        const index = Entity.entityList.findIndex((item) => item.entity === entity);
        if (index >= 0) Entity.entityList.splice(index, 1);
    }
}