import { Table, Column, Model, DataType, Default } from 'sequelize-typescript';

@Table({
    tableName: 'stock'
})
class Stock extends Model {
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
    declare transaction_date: Date;

    @Column({
        type: DataType.FLOAT,
        allowNull: false
    })
    declare quantity: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    declare input_output: number; // 1: entrada, 2: salida
}

export default Stock;
