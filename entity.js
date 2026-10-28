export class Entity{
    static entityList = [];
    static objectList = [];
    static player;

    static appendEntity(type, entity, id) {
        if(type == "entity") Entity.entityList.push({entity, id});
        else if(type == "object") Entity.objectList.push({entity, id});
        else {
            this.player = {entity, id}
        }
    }
}