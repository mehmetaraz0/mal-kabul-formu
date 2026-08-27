-- 0005_created_by_varsayilan.sql
-- companies.created_by ve products.created_by hiçbir insert kodu tarafından set edilmiyordu ve
-- şemada varsayılan değer yoktu — bu yüzden UI'dan eklenen her firma/ürün kalıcı olarak
-- created_by = NULL kalıyordu (geriye dönük doldurulamaz bir veri kaybı). auth.uid()'i varsayılan
-- yapmak, hangi kod yolundan insert edilirse edilsin (bugünkü UI, ileride eklenecek herhangi bir
-- başka yol) created_by'ın doğru kullanıcıya otomatik ayarlanmasını sağlar.
alter table companies alter column created_by set default auth.uid();
alter table products alter column created_by set default auth.uid();
