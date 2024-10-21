import { Table, Column, Model, DataType } from 'sequelize-typescript';

@Table({
    tableName: 'payments'
})
class Payments extends Model {
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    declare product_id: number;

    @Column({
        type: DataType.FLOAT,
        allowNull: false
    })
    declare price: number;

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare payment_method: string; // Puede ser "tarjeta", "efectivo", etc.
}

export default Payments;
