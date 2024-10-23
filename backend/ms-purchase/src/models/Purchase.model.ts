import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
    tableName: 'purchases'
})
class Purchase extends Model {
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    declare product_id: number;

    @Default(DataType.NOW) 
    @Column({
        type: DataType.DATE,
        allowNull: false
    })
    declare purchase_date: Date;

    @Column({
        type: DataType.STRING(255),
        allowNull: false
    })
    declare mailing_address: string;
}

export default Purchase;
